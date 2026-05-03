import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createObsidianAwsProfileRuntime,
  parseAwsCredentialsFile,
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

describe("createObsidianAwsProfileRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.isDesktopApp = true;
  });

  it("returns unavailable runtime outside desktop", async () => {
    Platform.isDesktopApp = false;
    const runtime = createObsidianAwsProfileRuntime();
    expect(runtime.available).toBe(false);
    expect(await runtime.readCredentials("default")).toBeNull();
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
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(readFile).toHaveBeenCalledWith(
      "/Users/tester/.aws/credentials",
      "utf8",
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
