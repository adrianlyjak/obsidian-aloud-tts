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
        polly_refreshCommand: "aws sso login",
      }),
    ).toEqual({
      polly_authMode: "profile",
      polly_profile: "work",
      polly_refreshCommand: "aws sso login",
    });
  });

  it("updates memory store", async () => {
    const store = memoryPollyAuthSettingsStore();
    await store.updateSettings({ polly_authMode: "profile" });
    expect(store.settings.polly_authMode).toBe("profile");
  });
});
