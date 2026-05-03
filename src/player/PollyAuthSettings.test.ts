import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, pluginSettingsStore } from "./TTSPluginSettings";

describe("PollyAuthSettings in TTSPluginSettings", () => {
  it("defaults to static auth", () => {
    expect(DEFAULT_SETTINGS.polly_authMode).toBe("static");
    expect(DEFAULT_SETTINGS.polly_profile).toBe("default");
    expect(DEFAULT_SETTINGS.polly_awsCliPath).toBe("");
    expect(DEFAULT_SETTINGS.polly_refreshCommand).toBe("");
  });

  it("persists profile settings through the store", async () => {
    let saved: unknown;
    const store = await pluginSettingsStore(
      async () => undefined,
      async (data) => {
        saved = data;
      },
    );
    await store.updateSettings({
      polly_authMode: "profile",
      polly_profile: "work",
      polly_awsCliPath: "/usr/bin/aws",
      polly_refreshCommand: "aws sso login",
    });
    expect(store.settings.polly_authMode).toBe("profile");
    expect(store.settings.polly_profile).toBe("work");
    expect(store.settings.polly_awsCliPath).toBe("/usr/bin/aws");
    expect(store.settings.polly_refreshCommand).toBe("aws sso login");
    expect((saved as Record<string, unknown>).polly_authMode).toBe("profile");
  });

  it("loads persisted profile settings", async () => {
    const store = await pluginSettingsStore(
      async () => ({
        polly_authMode: "profile",
        polly_profile: "prod",
        polly_awsCliPath: "/opt/aws",
        polly_refreshCommand: "aws sso login --profile prod",
      }),
      async () => {},
    );
    expect(store.settings.polly_authMode).toBe("profile");
    expect(store.settings.polly_profile).toBe("prod");
    expect(store.settings.polly_awsCliPath).toBe("/opt/aws");
    expect(store.settings.polly_refreshCommand).toBe(
      "aws sso login --profile prod",
    );
  });
});
