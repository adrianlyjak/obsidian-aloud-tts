import { Platform } from "obsidian";
import {
  AwsCredentials,
  AwsProfileRuntime,
  CredentialRefreshResult,
} from "../player/RuntimeServices";

type NodeRequire = (moduleName: string) => unknown;
type FsModule = {
  promises: {
    readFile(path: string, encoding: "utf8"): Promise<string>;
  };
};
type OsModule = {
  homedir(): string;
};
type ChildProcessModule = {
  exec(
    command: string,
    options: { timeout: number; windowsHide: boolean },
    callback: (error: unknown) => void,
  ): { kill(): void };
};

const REFRESH_TIMEOUT_MILLIS = 120_000;

export function createObsidianAwsProfileRuntime(): AwsProfileRuntime {
  if (!Platform.isDesktopApp || !windowRequire()) {
    return unavailableObsidianAwsProfileRuntime;
  }
  let refreshInFlight: Promise<CredentialRefreshResult> | undefined;
  return {
    available: true,
    async readCredentials(profile: string): Promise<AwsCredentials | null> {
      try {
        const requireFn = windowRequire();
        if (!requireFn) {
          return null;
        }
        const fs = requireFn("fs") as FsModule;
        const os = requireFn("os") as OsModule;
        const credentialsPath = `${os.homedir()}/.aws/credentials`;
        const contents = await fs.promises.readFile(credentialsPath, "utf8");
        return parseAwsCredentialsFile(contents, profile);
      } catch {
        return null;
      }
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

const unavailableObsidianAwsProfileRuntime: AwsProfileRuntime = {
  available: false,
  async readCredentials(): Promise<AwsCredentials | null> {
    return null;
  },
  async refreshCredentials(): Promise<CredentialRefreshResult> {
    return {
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    };
  },
};

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
      (error) => {
        window.clearTimeout(timeout);
        if (error) {
          resolve({
            ok: false,
            error: "The credential refresh command failed.",
          });
          return;
        }
        resolve({ ok: true });
      },
    );
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
