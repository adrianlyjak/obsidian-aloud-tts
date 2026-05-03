import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLLY_AUTH_SETTINGS,
  memoryPollyAuthSettingsStore,
  parsePollyAuthSettings,
} from "./PollyAuthSettings";

describe("PollyAuthSettings", () => {
  it("defaults to static auth", () => {
    expect(parsePollyAuthSettings(undefined)).toEqual(
      DEFAULT_POLLY_AUTH_SETTINGS,
    );
  });

  it("parses profile settings", () => {
    expect(
      parsePollyAuthSettings({
        polly_authMode: "profile",
        polly_profile: " work ",
        polly_awsCliPath: " /usr/bin/aws ",
        polly_refreshCommand: "aws sso login",
      }),
    ).toEqual({
      polly_authMode: "profile",
      polly_profile: "work",
      polly_awsCliPath: "/usr/bin/aws",
      polly_refreshCommand: "aws sso login",
    });
  });

  it("updates memory store", async () => {
    const store = memoryPollyAuthSettingsStore();
    await store.updateSettings({ polly_authMode: "profile" });
    expect(store.settings.polly_authMode).toBe("profile");
  });

  it("preserves existing values on partial updates", async () => {
    const store = memoryPollyAuthSettingsStore({
      polly_authMode: "profile",
      polly_profile: "work",
      polly_awsCliPath: "/usr/bin/aws",
      polly_refreshCommand: "aws sso login",
    });

    await store.updateSettings({ polly_profile: " personal " });

    expect(store.settings).toEqual({
      polly_authMode: "profile",
      polly_profile: "personal",
      polly_awsCliPath: "/usr/bin/aws",
      polly_refreshCommand: "aws sso login",
    });
  });
});
