import { REGISTRY } from "../models/registry";
import { listPollyVoicesWithCredentials } from "../models/polly";
import {
  AudioData,
  AudioTextContext,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "../models/tts-model";
import { TTSPluginSettings } from "./TTSPluginSettings";
import { PollyAuthSettingsStore } from "./PollyAuthSettings";
import { AwsCredentials, RuntimeServices } from "./RuntimeServices";

const POLLY_UNAVAILABLE =
  "AWS profile authentication is unavailable on this device.";
const POLLY_PROFILE_MISSING =
  "AWS profile credentials could not be read for this profile.";

export function runtimeAwareTTSModel(
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): TTSModel {
  async function withPollyCredentials<T>(
    settings: TTSPluginSettings,
    callback: (effectiveSettings: TTSPluginSettings) => Promise<T>,
  ): Promise<T> {
    if (
      settings.modelProvider !== "polly" ||
      pollyAuthSettings.settings.polly_authMode === "static"
    ) {
      return callback(settings);
    }

    try {
      const effectiveSettings = await settingsWithProfileCredentials(
        settings,
        pollyAuthSettings,
        runtime,
      );
      return await callback(effectiveSettings);
    } catch (error) {
      if (!shouldRefreshAndRetry(error, pollyAuthSettings)) {
        throw error;
      }
      if (!(await refreshProfileCredentials(pollyAuthSettings, runtime))) {
        throw error;
      }
      const refreshedSettings = await settingsWithProfileCredentials(
        settings,
        pollyAuthSettings,
        runtime,
      );
      return callback(refreshedSettings);
    }
  }

  function getModel(settings: TTSPluginSettings): TTSModel {
    return REGISTRY[settings.modelProvider];
  }

  return {
    async call(
      text: string,
      options: TTSModelOptions,
      settings: TTSPluginSettings,
      context?: AudioTextContext,
    ): Promise<AudioData> {
      return withPollyCredentials(settings, (effectiveSettings) =>
        getModel(settings).call(text, options, effectiveSettings, context),
      );
    },
    async validateConnection(
      settings: TTSPluginSettings,
    ): Promise<string | undefined> {
      if (
        settings.modelProvider !== "polly" ||
        pollyAuthSettings.settings.polly_authMode === "static"
      ) {
        return getModel(settings).validateConnection(settings);
      }
      if (!settings.polly_region.trim()) {
        return "Please specify an AWS region";
      }
      try {
        await validatePollyProfileConnection(
          settings,
          pollyAuthSettings,
          runtime,
        );
        return undefined;
      } catch (error) {
        if (
          shouldRefreshAndRetry(error, pollyAuthSettings) &&
          (await refreshProfileCredentials(pollyAuthSettings, runtime))
        ) {
          try {
            await validatePollyProfileConnection(
              settings,
              pollyAuthSettings,
              runtime,
            );
            return undefined;
          } catch {
            return "Invalid AWS credentials or insufficient permissions";
          }
        }
        return pollyValidationError(error);
      }
    },
    convertToOptions(settings: TTSPluginSettings): TTSModelOptions {
      const options = getModel(settings).convertToOptions(settings);
      if (
        settings.modelProvider === "polly" &&
        pollyAuthSettings.settings.polly_authMode === "profile"
      ) {
        return {
          ...options,
          apiKey: `profile:${pollyAuthSettings.settings.polly_profile}`,
        };
      }
      return options;
    },
  };
}

export async function resolvePollyCredentials(
  settings: TTSPluginSettings,
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): Promise<AwsCredentials | string> {
  if (pollyAuthSettings.settings.polly_authMode === "static") {
    if (!settings.polly_accessKeyId || !settings.polly_secretAccessKey) {
      return REQUIRE_API_KEY;
    }
    return {
      accessKeyId: settings.polly_accessKeyId,
      secretAccessKey: settings.polly_secretAccessKey,
    };
  }
  if (!runtime.awsProfiles.available) {
    return POLLY_UNAVAILABLE;
  }
  const result = await runtime.awsProfiles.readCredentials(
    pollyAuthSettings.settings.polly_profile,
    pollyAuthSettings.settings.polly_awsCliPath,
  );
  if (!result.ok) {
    return result.error || POLLY_PROFILE_MISSING;
  }
  if (!result.credentials.accessKeyId || !result.credentials.secretAccessKey) {
    return "AWS profile did not resolve access key and secret key credentials.";
  }
  return result.credentials;
}

async function settingsWithProfileCredentials(
  settings: TTSPluginSettings,
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): Promise<TTSPluginSettings> {
  const credentials = await resolvePollyCredentials(
    settings,
    pollyAuthSettings,
    runtime,
  );
  if (typeof credentials === "string") {
    throw pollyProfileCredentialError(credentials);
  }
  return {
    ...settings,
    polly_accessKeyId: credentials.accessKeyId,
    polly_secretAccessKey: credentials.secretAccessKey,
    polly_sessionToken: credentials.sessionToken,
  };
}

async function credentialsOrThrow(
  settings: TTSPluginSettings,
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): Promise<AwsCredentials> {
  const credentials = await resolvePollyCredentials(
    settings,
    pollyAuthSettings,
    runtime,
  );
  if (typeof credentials === "string") {
    throw pollyProfileCredentialError(credentials);
  }
  return credentials;
}

async function validatePollyProfileConnection(
  settings: TTSPluginSettings,
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): Promise<void> {
  const credentials = await credentialsOrThrow(
    settings,
    pollyAuthSettings,
    runtime,
  );
  await listPollyVoicesWithCredentials(credentials, settings.polly_region);
}

async function refreshProfileCredentials(
  pollyAuthSettings: PollyAuthSettingsStore,
  runtime: RuntimeServices,
): Promise<boolean> {
  const result = await runtime.awsProfiles.refreshCredentials(
    pollyAuthSettings.settings.polly_refreshCommand,
  );
  return result.ok;
}

function pollyValidationError(error: unknown): string {
  if (error instanceof TTSErrorInfo) {
    if (error.httpErrorCode === 403 || error.httpErrorCode === 401) {
      return "Invalid AWS credentials or insufficient permissions";
    }
    if (error.httpErrorCode !== undefined) {
      return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
    }
    return error.ttsJsonMessage() || error.message;
  }
  return error instanceof Error ? error.message : POLLY_PROFILE_MISSING;
}

function shouldRefreshAndRetry(
  error: unknown,
  pollyAuthSettings: PollyAuthSettingsStore,
): boolean {
  return (
    pollyAuthSettings.settings.polly_authMode === "profile" &&
    !!pollyAuthSettings.settings.polly_refreshCommand.trim() &&
    ((error instanceof TTSErrorInfo &&
      (error.httpErrorCode === 401 ||
        error.httpErrorCode === 403 ||
        error.ttsErrorCode() === "aws_profile_credentials")) ||
      (error instanceof Error && !(error instanceof TTSErrorInfo)))
  );
}

function pollyProfileCredentialError(message: string): TTSErrorInfo {
  return new TTSErrorInfo("AWS profile credential error", {
    error: {
      message,
      type: "aws_profile_credentials",
      code: "aws_profile_credentials",
      param: null,
    },
  });
}
