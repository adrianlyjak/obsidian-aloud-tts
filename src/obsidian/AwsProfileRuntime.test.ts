import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createObsidianAwsProfileRuntime,
  parseAwsExecutablePath,
  parseAwsCredentialProcessOutput,
  parseAwsCredentialsFile,
  parseAwsProfileNames,
} from "./AwsProfileRuntime";
import { Platform } from "obsidian";

vi.mock("obsidian", () => ({
  Platform: {
    isDesktopApp: true,
  },
}));

describe("parseAwsCredentialsFile", () => {
  it("parses default credentials", () => {
    expect(
      parseAwsCredentialsFile(
        `[default]
aws_access_key_id = key
aws_secret_access_key = secret
`,
        "default",
      ),
    ).toEqual({ accessKeyId: "key", secretAccessKey: "secret" });
  });

  it("parses session tokens, comments, and whitespace", () => {
    expect(
      parseAwsCredentialsFile(
        `# comment
[other]
aws_access_key_id = other
aws_secret_access_key = other-secret

[work]
aws_access_key_id= key
aws_secret_access_key = secret
aws_session_token = token ; local note
`,
        "work",
      ),
    ).toEqual({
      accessKeyId: "key",
      secretAccessKey: "secret",
      sessionToken: "token",
    });
  });

  it("returns null for missing or incomplete profiles", () => {
    expect(
      parseAwsCredentialsFile("[default]\naws_access_key_id = key", "default"),
    ).toBeNull();
    expect(
      parseAwsCredentialsFile("[default]\naws_access_key_id = key", "missing"),
    ).toBeNull();
  });
});

describe("parseAwsProfileNames", () => {
  it("parses credentials file profile names", () => {
    expect(
      parseAwsProfileNames(
        `[work]
aws_access_key_id = key

[default]
aws_access_key_id = other
`,
        "credentials",
      ),
    ).toEqual(["default", "work"]);
  });

  it("parses config file profile names", () => {
    expect(
      parseAwsProfileNames(
        `[default]
region = us-east-1

[profile stg]
sso_session = main

[sso-session main]
sso_start_url = https://example.com/start
`,
        "config",
      ),
    ).toEqual(["default", "stg"]);
  });
});

describe("parseAwsCredentialProcessOutput", () => {
  it("parses AWS CLI exported credentials", () => {
    expect(
      parseAwsCredentialProcessOutput(
        JSON.stringify({
          Version: 1,
          AccessKeyId: "key",
          SecretAccessKey: "secret",
          SessionToken: "token",
        }),
      ),
    ).toEqual({
      accessKeyId: "key",
      secretAccessKey: "secret",
      sessionToken: "token",
    });
  });

  it("returns null for invalid output", () => {
    expect(parseAwsCredentialProcessOutput("{}")).toBeNull();
    expect(parseAwsCredentialProcessOutput("not json")).toBeNull();
  });
});

describe("parseAwsExecutablePath", () => {
  it("parses unix and Windows aws executable discovery output", () => {
    expect(parseAwsExecutablePath("/mock/bin/aws\n")).toBe("/mock/bin/aws");
    expect(
      parseAwsExecutablePath(
        "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe\r\n",
      ),
    ).toBe("C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe");
  });
});

describe("createObsidianAwsProfileRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.isDesktopApp = true;
  });

  it("returns unavailable runtime outside desktop", async () => {
    Platform.isDesktopApp = false;
    const runtime = createObsidianAwsProfileRuntime();
    expect(runtime.available).toBe(false);
    await expect(runtime.readCredentials("default")).resolves.toEqual({
      ok: false,
      error: "AWS profile authentication is unavailable on this device.",
    });
    expect((await runtime.refreshCredentials("aws sso login")).ok).toBe(false);
  });

  it("reads credentials with mocked window.require", async () => {
    const readFile = vi.fn().mockResolvedValue(`[default]
aws_access_key_id = key
aws_secret_access_key = secret
`);
    const require = vi.fn((moduleName: string) => {
      if (moduleName === "fs") {
        return { promises: { readFile } };
      }
      if (moduleName === "os") {
        return { homedir: () => "/Users/tester" };
      }
      throw new Error(moduleName);
    });
    Object.assign(window, { require });

    const runtime = createObsidianAwsProfileRuntime();
    await expect(runtime.readCredentials("default")).resolves.toEqual({
      ok: true,
      credentials: {
        accessKeyId: "key",
        secretAccessKey: "secret",
      },
    });
    expect(readFile).toHaveBeenCalledWith(
      "/Users/tester/.aws/credentials",
      "utf8",
    );
  });

  it("falls back to AWS CLI profile resolution", async () => {
    const readFile = vi.fn().mockResolvedValue("");
    const execFile = vi.fn((_file, _args, _options, cb) => {
      cb(
        null,
        JSON.stringify({
          Version: 1,
          AccessKeyId: "key",
          SecretAccessKey: "secret",
          SessionToken: "token",
        }),
        "",
      );
      return { kill: vi.fn() };
    });
    const require = vi.fn((moduleName: string) => {
      if (moduleName === "fs") {
        return { promises: { readFile } };
      }
      if (moduleName === "os") {
        return { homedir: () => "/Users/tester" };
      }
      if (moduleName === "child_process") {
        return { execFile };
      }
      throw new Error(moduleName);
    });
    Object.assign(window, { require });

    const runtime = createObsidianAwsProfileRuntime();
    await expect(runtime.readCredentials("stg", "custom-aws")).resolves.toEqual(
      {
        ok: true,
        credentials: {
          accessKeyId: "key",
          secretAccessKey: "secret",
          sessionToken: "token",
        },
      },
    );
    expect(execFile).toHaveBeenCalledWith(
      "custom-aws",
      [
        "configure",
        "export-credentials",
        "--profile",
        "stg",
        "--format",
        "process",
      ],
      { timeout: 120000, windowsHide: true },
      expect.any(Function),
    );
  });

  it("discovers the AWS CLI from the user shell when Obsidian PATH misses it", async () => {
    const readFile = vi.fn().mockResolvedValue("");
    const execFile = vi.fn((file, _args, _options, cb) => {
      if (file === "aws") {
        cb(Object.assign(new Error("not found"), { code: "ENOENT" }), "", "");
        return { kill: vi.fn() };
      }
      if (file === "/bin/zsh") {
        cb(null, "/mock/bin/aws\n", "");
        return { kill: vi.fn() };
      }
      if (file === "/mock/bin/aws") {
        cb(
          null,
          JSON.stringify({
            Version: 1,
            AccessKeyId: "key",
            SecretAccessKey: "secret",
            SessionToken: "token",
          }),
          "",
        );
        return { kill: vi.fn() };
      }
      throw new Error(String(file));
    });
    const require = vi.fn((moduleName: string) => {
      if (moduleName === "fs") {
        return { promises: { readFile } };
      }
      if (moduleName === "os") {
        return {
          homedir: () => "/Users/tester",
          userInfo: () => ({ shell: "/bin/zsh" }),
        };
      }
      if (moduleName === "child_process") {
        return { execFile };
      }
      throw new Error(moduleName);
    });
    Object.assign(window, { require });

    const runtime = createObsidianAwsProfileRuntime();
    await expect(runtime.readCredentials("stg")).resolves.toEqual({
      ok: true,
      credentials: {
        accessKeyId: "key",
        secretAccessKey: "secret",
        sessionToken: "token",
      },
    });
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      "aws",
      [
        "configure",
        "export-credentials",
        "--profile",
        "stg",
        "--format",
        "process",
      ],
      { timeout: 120000, windowsHide: true },
      expect.any(Function),
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      "/bin/zsh",
      ["-lc", "command -v aws"],
      { timeout: 10000, windowsHide: true },
      expect.any(Function),
    );
    expect(execFile).toHaveBeenNthCalledWith(
      3,
      "/mock/bin/aws",
      [
        "configure",
        "export-credentials",
        "--profile",
        "stg",
        "--format",
        "process",
      ],
      { timeout: 120000, windowsHide: true },
      expect.any(Function),
    );
  });

  it("lists local and AWS CLI profiles", async () => {
    const readFile = vi.fn((path: string) => {
      if (path.endsWith("/.aws/credentials")) {
        return Promise.resolve("[default]\n[work]\n");
      }
      if (path.endsWith("/.aws/config")) {
        return Promise.resolve("[profile stg]\n[sso-session main]\n");
      }
      return Promise.reject(new Error(path));
    });
    const execFile = vi.fn((_file, _args, _options, cb) => {
      cb(null, "cli\nstg\n", "");
      return { kill: vi.fn() };
    });
    const require = vi.fn((moduleName: string) => {
      if (moduleName === "fs") {
        return { promises: { readFile } };
      }
      if (moduleName === "os") {
        return { homedir: () => "/Users/tester" };
      }
      if (moduleName === "child_process") {
        return { execFile };
      }
      throw new Error(moduleName);
    });
    Object.assign(window, { require });

    const runtime = createObsidianAwsProfileRuntime();
    await expect(runtime.listProfiles("custom-aws")).resolves.toEqual([
      "default",
      "cli",
      "stg",
      "work",
    ]);
    expect(execFile).toHaveBeenCalledWith(
      "custom-aws",
      ["configure", "list-profiles"],
      { timeout: 120000, windowsHide: true },
      expect.any(Function),
    );
  });

  it("coalesces concurrent refresh commands", async () => {
    let callback: ((error: unknown) => void) | undefined;
    const exec = vi.fn((_command, _options, cb) => {
      callback = cb;
      return { kill: vi.fn() };
    });
    Object.assign(window, {
      require: vi.fn((moduleName: string) => {
        if (moduleName === "child_process") {
          return { exec };
        }
        throw new Error(moduleName);
      }),
    });
    const runtime = createObsidianAwsProfileRuntime();
    const first = runtime.refreshCredentials("aws sso login");
    const second = runtime.refreshCredentials("aws sso login");
    callback?.(null);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
