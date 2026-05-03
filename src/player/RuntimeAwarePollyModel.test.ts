import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./TTSPluginSettings";
import { memoryPollyAuthSettingsStore } from "./PollyAuthSettings";
import { RuntimeServices } from "./RuntimeServices";
import {
  resolvePollyCredentials,
  runtimeAwareTTSModel,
} from "./RuntimeAwarePollyModel";
import { TTSErrorInfo } from "../models/tts-model";

const mocks = vi.hoisted(() => ({
  pollyCall: vi.fn(),
  validateConnection: vi.fn(),
}));

vi.mock("../models/registry", () => ({
  REGISTRY: {
    polly: {
      call: mocks.pollyCall,
      validateConnection: mocks.validateConnection,
      convertToOptions: () => ({
        apiKey: "static-key",
        apiUri: "https://polly.us-east-1.amazonaws.com",
        voice: "Joanna",
        model: "neural",
      }),
    },
    openai: {
      call: vi.fn(),
      validateConnection: vi.fn(),
      convertToOptions: () => ({ model: "openai" }),
    },
  },
}));

function runtime(): RuntimeServices {
  return {
    awsProfiles: {
      available: true,
      readCredentials: vi.fn().mockResolvedValue({
        accessKeyId: "profile-key",
        secretAccessKey: "profile-secret",
        sessionToken: "session",
      }),
      refreshCredentials: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

describe("RuntimeAwarePollyModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pollyCall.mockResolvedValue({
      data: new ArrayBuffer(1),
      format: "mp3",
    });
    mocks.validateConnection.mockResolvedValue(undefined);
  });

  it("resolves static credentials", async () => {
    await expect(
      resolvePollyCredentials(
        {
          ...DEFAULT_SETTINGS,
          polly_accessKeyId: "key",
          polly_secretAccessKey: "secret",
        },
        memoryPollyAuthSettingsStore(),
        runtime(),
      ),
    ).resolves.toEqual({ accessKeyId: "key", secretAccessKey: "secret" });
  });

  it("resolves profile credentials", async () => {
    const auth = memoryPollyAuthSettingsStore({ polly_authMode: "profile" });
    await expect(
      resolvePollyCredentials(DEFAULT_SETTINGS, auth, runtime()),
    ).resolves.toEqual({
      accessKeyId: "profile-key",
      secretAccessKey: "profile-secret",
      sessionToken: "session",
    });
  });

  it("uses profile identity for cache options without exposing credentials", () => {
    const auth = memoryPollyAuthSettingsStore({
      polly_authMode: "profile",
      polly_profile: "work",
    });
    const options = runtimeAwareTTSModel(auth, runtime()).convertToOptions({
      ...DEFAULT_SETTINGS,
      modelProvider: "polly",
    });
    expect(options.apiKey).toBe("profile:work");
  });

  it("refreshes and retries once on auth failure", async () => {
    const auth = memoryPollyAuthSettingsStore({
      polly_authMode: "profile",
      polly_refreshCommand: "aws sso login",
    });
    const services = runtime();
    mocks.pollyCall
      .mockRejectedValueOnce(new TTSErrorInfo("HTTP 403 error", undefined, 403))
      .mockResolvedValueOnce({ data: new ArrayBuffer(1), format: "mp3" });

    await runtimeAwareTTSModel(auth, services).call(
      "hello",
      { model: "neural" },
      { ...DEFAULT_SETTINGS, modelProvider: "polly" },
    );

    expect(services.awsProfiles.refreshCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.pollyCall).toHaveBeenCalledTimes(2);
  });
});
