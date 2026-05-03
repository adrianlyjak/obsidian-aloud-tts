import { Platform } from "obsidian";
import {
  AwsCredentialReadResult,
  AwsCredentials,
  AwsProfileRuntime,
  CredentialRefreshResult,
  unavailableAwsProfileRuntime,
} from "../player/RuntimeServices";

type NodeRequire = (moduleName: string) => unknown;
type FsModule = {
  promises: {
    readFile(path: string, encoding: "utf8"): Promise<string>;
  };
};
type OsModule = {
  homedir(): string;
  userInfo?(): {
    shell?: string;
  };
};
type PathModule = {
  join(...parts: string[]): string;
};
type ChildProcessModule = {
  exec(
    command: string,
    options: { timeout: number; windowsHide: boolean },
    callback: (error: unknown, stdout: string, stderr: string) => void,
  ): { kill(): void };
  execFile(
    file: string,
    args: readonly string[],
    options: { timeout: number; windowsHide: boolean },
    callback: (error: unknown, stdout: string, stderr: string) => void,
  ): { kill(): void };
};

const REFRESH_TIMEOUT_MILLIS = 120_000;
const DISCOVERY_TIMEOUT_MILLIS = 10_000;

type AwsCliResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; executableNotFound?: boolean };
type AwsExecutableDiscoveryResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export function createObsidianAwsProfileRuntime(): AwsProfileRuntime {
  if (!Platform.isDesktopApp || !windowRequire()) {
    return unavailableAwsProfileRuntime;
  }
  let refreshInFlight: Promise<CredentialRefreshResult> | undefined;
  return {
    available: true,
    async listProfiles(awsCliPath?: string): Promise<string[]> {
      return listAwsProfiles(awsCliPath);
    },
    async readCredentials(
      profile: string,
      awsCliPath?: string,
    ): Promise<AwsCredentialReadResult> {
      let foundStaticProfile = false;
      try {
        const requireFn = windowRequire();
        if (!requireFn) {
          return {
            ok: false,
            error: "AWS profile authentication is unavailable on this device.",
          };
        }
        const fs = requireFn("fs") as FsModule;
        const os = requireFn("os") as OsModule;
        const credentialsPath = awsProfilePath(requireFn, os, "credentials");
        const contents = await fs.promises.readFile(credentialsPath, "utf8");
        foundStaticProfile = parseAwsProfileNames(
          contents,
          "credentials",
        ).includes(profile);
        const credentials = parseAwsCredentialsFile(contents, profile);
        if (credentials) {
          return { ok: true, credentials };
        }
      } catch {
        // Static profiles are optional; the CLI can resolve SSO and process providers.
      }
      const cliResult = await readAwsCliCredentials(profile, awsCliPath);
      if (cliResult.ok) {
        return cliResult;
      }
      if (foundStaticProfile) {
        return {
          ok: false,
          error: `AWS profile "${profile}" is missing aws_access_key_id or aws_secret_access_key in ~/.aws/credentials.`,
        };
      }
      const localProfiles = await listLocalAwsProfiles();
      if (localProfiles.includes(profile)) {
        return {
          ok: false,
          error: `AWS profile "${profile}" was found, but credentials could not be resolved. For SSO profiles, set AWS CLI Path or make sure aws is available to Obsidian. ${cliResult.error}`,
        };
      }
      return {
        ok: false,
        error: `AWS profile "${profile}" was not found in local AWS config or credentials. ${cliResult.error}`,
      };
    },
    async refreshCredentials(
      command: string,
    ): Promise<CredentialRefreshResult> {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) {
        return { ok: false, error: "No refresh command is configured." };
      }
      if (refreshInFlight) {
        return refreshInFlight;
      }
      refreshInFlight = runRefreshCommand(trimmedCommand).finally(() => {
        refreshInFlight = undefined;
      });
      return refreshInFlight;
    },
  };
}

export function parseAwsCredentialsFile(
  contents: string,
  profile: string,
): AwsCredentials | null {
  const sections = new Map<string, Record<string, string>>();
  let currentSection: Record<string, string> | undefined;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      currentSection = {};
      sections.set(sectionName, currentSection);
      continue;
    }
    if (!currentSection) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = stripInlineComment(line.slice(separator + 1).trim());
    currentSection[key] = value;
  }

  const found = sections.get(profile);
  if (!found?.aws_access_key_id || !found.aws_secret_access_key) {
    return null;
  }
  return {
    accessKeyId: found.aws_access_key_id,
    secretAccessKey: found.aws_secret_access_key,
    sessionToken: found.aws_session_token || undefined,
  };
}

export function parseAwsProfileNames(
  contents: string,
  source: "config" | "credentials",
): string[] {
  const names = new Set<string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (!sectionMatch) {
      continue;
    }
    const name = awsProfileNameFromSection(sectionMatch[1].trim(), source);
    if (name) {
      names.add(name);
    }
  }
  return sortProfileNames([...names]);
}

export function parseAwsCredentialProcessOutput(
  contents: string,
): AwsCredentials | null {
  try {
    const value = JSON.parse(contents) as Partial<{
      AccessKeyId: unknown;
      SecretAccessKey: unknown;
      SessionToken: unknown;
    }>;
    if (
      typeof value.AccessKeyId !== "string" ||
      typeof value.SecretAccessKey !== "string"
    ) {
      return null;
    }
    return {
      accessKeyId: value.AccessKeyId,
      secretAccessKey: value.SecretAccessKey,
      sessionToken:
        typeof value.SessionToken === "string" ? value.SessionToken : undefined,
    };
  } catch {
    return null;
  }
}

async function runRefreshCommand(
  command: string,
): Promise<CredentialRefreshResult> {
  const requireFn = windowRequire();
  if (!requireFn) {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  }
  const childProcess = requireFn("child_process") as ChildProcessModule;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        error: "The credential refresh command timed out.",
      });
    }, REFRESH_TIMEOUT_MILLIS + 1000);
    const child = childProcess.exec(
      command,
      { timeout: REFRESH_TIMEOUT_MILLIS, windowsHide: true },
      (error, _stdout, stderr) => {
        window.clearTimeout(timeout);
        if (error) {
          resolve({
            ok: false,
            error: `The credential refresh command failed. ${errorSummary(
              error,
              stderr,
            )}`,
          });
          return;
        }
        resolve({ ok: true });
      },
    );
  });
}

async function readAwsCliCredentials(
  profile: string,
  awsCliPath: string | undefined,
): Promise<AwsCredentialReadResult> {
  const output = await runAwsCli(
    [
      "configure",
      "export-credentials",
      "--profile",
      profile,
      "--format",
      "process",
    ],
    awsCliPath,
  );
  if (!output.ok) {
    return { ok: false, error: output.error };
  }
  const credentials = parseAwsCredentialProcessOutput(output.stdout);
  if (!credentials) {
    return {
      ok: false,
      error: "AWS CLI returned credentials in an unexpected format.",
    };
  }
  return { ok: true, credentials };
}

async function listAwsProfiles(
  awsCliPath: string | undefined,
): Promise<string[]> {
  const [localNames, cliNames] = await Promise.all([
    listLocalAwsProfiles(),
    listAwsCliProfiles(awsCliPath),
  ]);
  return sortProfileNames([...new Set([...localNames, ...cliNames])]);
}

async function listLocalAwsProfiles(): Promise<string[]> {
  const requireFn = windowRequire();
  if (!requireFn) {
    return [];
  }
  try {
    const fs = requireFn("fs") as FsModule;
    const os = requireFn("os") as OsModule;
    const [credentialsProfiles, configProfiles] = await Promise.all([
      readAwsProfileFile(
        fs,
        awsProfilePath(requireFn, os, "credentials"),
        "credentials",
      ),
      readAwsProfileFile(fs, awsProfilePath(requireFn, os, "config"), "config"),
    ]);
    return sortProfileNames([...credentialsProfiles, ...configProfiles]);
  } catch {
    return [];
  }
}

function awsProfilePath(
  requireFn: NodeRequire,
  os: OsModule,
  fileName: "config" | "credentials",
): string {
  try {
    const path = requireFn("path") as PathModule;
    return path.join(os.homedir(), ".aws", fileName);
  } catch {
    return `${os.homedir()}/.aws/${fileName}`;
  }
}

async function readAwsProfileFile(
  fs: FsModule,
  path: string,
  source: "config" | "credentials",
): Promise<string[]> {
  try {
    return parseAwsProfileNames(
      await fs.promises.readFile(path, "utf8"),
      source,
    );
  } catch {
    return [];
  }
}

async function listAwsCliProfiles(
  awsCliPath: string | undefined,
): Promise<string[]> {
  const output = await runAwsCli(["configure", "list-profiles"], awsCliPath);
  if (!output.ok) {
    return [];
  }
  return output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !!line);
}

async function runAwsCli(
  args: readonly string[],
  awsCliPath: string | undefined,
): Promise<AwsCliResult> {
  const requireFn = windowRequire();
  if (!requireFn) {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  }
  let childProcess: ChildProcessModule;
  try {
    childProcess = requireFn("child_process") as ChildProcessModule;
  } catch {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  }
  const configuredExecutable = awsCliPath?.trim();
  if (configuredExecutable) {
    return runExecutable(childProcess, configuredExecutable, args);
  }

  const pathResult = await runExecutable(childProcess, "aws", args);
  if (pathResult.ok || !pathResult.executableNotFound) {
    return pathResult;
  }

  const discoveryResult = await discoverAwsExecutable(childProcess, requireFn);
  if (!discoveryResult.ok) {
    return {
      ok: false,
      error: `${pathResult.error} ${discoveryResult.error}`,
      executableNotFound: true,
    };
  }

  return runExecutable(childProcess, discoveryResult.path, args);
}

function runExecutable(
  childProcess: ChildProcessModule,
  executable: string,
  args: readonly string[],
): Promise<AwsCliResult> {
  return execFileWithTimeout(
    childProcess,
    executable,
    args,
    REFRESH_TIMEOUT_MILLIS,
    (exec, error, stderr) => awsCliError(exec, error, stderr),
    (exec) => `AWS CLI executable "${exec}" could not be started.`,
  );
}

async function discoverAwsExecutable(
  childProcess: ChildProcessModule,
  requireFn: NodeRequire,
): Promise<AwsExecutableDiscoveryResult> {
  const platform = currentPlatform();
  if (platform === "win32") {
    return discoverWindowsAwsExecutable(childProcess);
  }
  return discoverShellAwsExecutable(childProcess, requireFn);
}

async function discoverWindowsAwsExecutable(
  childProcess: ChildProcessModule,
): Promise<AwsExecutableDiscoveryResult> {
  const result = await runDiscoveryCommand(childProcess, "where.exe", ["aws"]);
  if (result.ok) {
    const path = parseAwsExecutablePath(result.stdout);
    if (path) {
      return { ok: true, path };
    }
  }
  return {
    ok: false,
    error: "Automatic AWS CLI discovery did not find aws through Windows PATH.",
  };
}

async function discoverShellAwsExecutable(
  childProcess: ChildProcessModule,
  requireFn: NodeRequire,
): Promise<AwsExecutableDiscoveryResult> {
  const shell = userShell(requireFn);
  const args = loginShellArgs(shell);
  const result = await runDiscoveryCommand(childProcess, shell, args);
  if (result.ok) {
    const path = parseAwsExecutablePath(result.stdout);
    if (path) {
      return { ok: true, path };
    }
  }
  return {
    ok: false,
    error:
      "Automatic AWS CLI discovery did not find aws through the user's login shell.",
  };
}

function runDiscoveryCommand(
  childProcess: ChildProcessModule,
  executable: string,
  args: readonly string[],
): Promise<AwsCliResult> {
  return execFileWithTimeout(
    childProcess,
    executable,
    args,
    DISCOVERY_TIMEOUT_MILLIS,
    (_exec, error, stderr) => errorSummary(error, stderr),
    (exec) => `Executable "${exec}" could not be started.`,
  );
}

function execFileWithTimeout(
  childProcess: ChildProcessModule,
  executable: string,
  args: readonly string[],
  timeoutMillis: number,
  formatError: (executable: string, error: unknown, stderr: string) => string,
  formatSpawnError: (executable: string) => string,
): Promise<AwsCliResult> {
  return new Promise((resolve) => {
    let settled = false;
    let child: { kill(): void } | undefined;
    const finish = (result: AwsCliResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve(result);
    };
    const timeout = window.setTimeout(() => {
      child?.kill();
      finish({
        ok: false,
        error: `Timed out after ${Math.round(timeoutMillis / 1000)}s running "${executable}".`,
      });
    }, timeoutMillis + 1000);
    try {
      child = childProcess.execFile(
        executable,
        args,
        { timeout: timeoutMillis, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            finish({
              ok: false,
              error: formatError(executable, error, stderr),
              executableNotFound: errorCode(error) === "ENOENT",
            });
            return;
          }
          finish({ ok: true, stdout });
        },
      );
    } catch {
      finish({
        ok: false,
        error: formatSpawnError(executable),
      });
    }
  });
}

export function parseAwsExecutablePath(stdout: string): string | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !!line);
  return (
    lines.find((line) => /(^|[/\\])aws(?:\.exe|\.cmd|\.bat)?$/i.test(line)) ||
    lines[0]
  );
}

function userShell(requireFn: NodeRequire): string {
  try {
    const os = requireFn("os") as OsModule;
    const shell = os.userInfo?.().shell;
    if (shell) {
      return shell;
    }
  } catch {
    // Fall through to env/default shell discovery.
  }
  const envShell = processEnv("SHELL");
  if (envShell) {
    return envShell;
  }
  return currentPlatform() === "darwin" ? "/bin/zsh" : "/bin/sh";
}

function loginShellArgs(shell: string): string[] {
  const shellName = shell.split(/[\\/]/).pop() || "";
  if (/^(bash|zsh|fish)$/.test(shellName)) {
    return ["-lc", "command -v aws"];
  }
  return ["-c", "command -v aws"];
}

function awsCliError(
  awsExecutable: string,
  error: unknown,
  stderr: string,
): string {
  if (errorCode(error) === "ENOENT") {
    return `AWS CLI executable "${awsExecutable}" was not found. Set AWS CLI Path to the full aws executable path.`;
  }
  return `AWS CLI failed. ${errorSummary(error, stderr)}`;
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return "";
  }
  return String(error.code);
}

function currentPlatform(): string {
  return typeof process === "object" && process ? process.platform : "";
}

function processEnv(name: string): string | undefined {
  if (typeof process !== "object" || !process) {
    return undefined;
  }
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorSummary(error: unknown, stderr: string): string {
  const stderrText = firstUsefulLine(stderr);
  if (stderrText) {
    return stderrText;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "No error details were provided.";
}

function firstUsefulLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => !!line)
      ?.slice(0, 300) ?? ""
  );
}

function awsProfileNameFromSection(
  sectionName: string,
  source: "config" | "credentials",
): string | undefined {
  if (source === "credentials") {
    return sectionName;
  }
  if (sectionName === "default") {
    return "default";
  }
  const profileMatch = /^profile\s+(.+)$/.exec(sectionName);
  return profileMatch?.[1]?.trim() || undefined;
}

function sortProfileNames(names: string[]): string[] {
  return [...new Set(names)].sort((left, right) => {
    if (left === "default") {
      return -1;
    }
    if (right === "default") {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function stripInlineComment(value: string): string {
  const commentIndex = value.search(/\s[#;]/);
  if (commentIndex < 0) {
    return value;
  }
  return value.slice(0, commentIndex).trim();
}

function windowRequire(): NodeRequire | undefined {
  const candidate = window as Window & { require?: NodeRequire };
  return typeof candidate.require === "function"
    ? candidate.require
    : undefined;
}
