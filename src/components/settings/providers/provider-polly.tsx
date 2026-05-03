import { observer } from "mobx-react-lite";
import React from "react";
import {
  PollyAuthMode,
  TTSPluginSettingsStore,
} from "../../../player/TTSPluginSettings";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";
import { ApiKeyComponent } from "../api-key-component";
import {
  listPollyVoicesWithCredentials,
  POLLY_REGIONS,
  POLLY_ENGINES,
  PollyVoice,
} from "../../../models/polly";
import { RuntimeServices } from "../../../player/RuntimeServices";
import { OptionSelect } from "../option-select";
import { resolvePollyCredentials } from "../../../player/RuntimeAwarePollyModel";

const AUTH_MODE_OPTIONS: readonly { label: string; value: PollyAuthMode }[] = [
  { label: "Static Credentials", value: "static" },
  { label: "AWS Profile", value: "profile" },
];

export const PollySettings = observer(
  ({
    store,
    runtime,
  }: {
    store: TTSPluginSettingsStore;
    runtime: RuntimeServices;
  }) => {
    return (
      <>
        <AuthMode store={store} runtime={runtime} />
        {store.settings.polly_authMode === "static" ? (
          <AwsCredentials store={store} />
        ) : (
          <AwsProfile store={store} runtime={runtime} />
        )}
        <PollyRegionComponent store={store} />
        <PollyEngineComponent store={store} />
        <PollyVoiceComponent store={store} runtime={runtime} />
      </>
    );
  },
);

const AuthMode: React.FC<{
  store: TTSPluginSettingsStore;
  runtime: RuntimeServices;
}> = observer(({ store, runtime }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Authentication Mode</div>
        <div className="setting-item-description">
          Choose whether Polly uses static credentials or an AWS profile.
          {!runtime.awsProfiles.available && (
            <div>
              AWS profile authentication is only available in the desktop app.
            </div>
          )}
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={AUTH_MODE_OPTIONS.map((option) => ({
            ...option,
            disabled:
              option.value === "profile" && !runtime.awsProfiles.available,
          }))}
          value={store.settings.polly_authMode}
          onChange={(value) =>
            store.updateSettings({
              polly_authMode: value as PollyAuthMode,
            })
          }
        />
      </div>
    </div>
  );
});

const AwsCredentials: React.FC<{ store: TTSPluginSettingsStore }> = observer(
  ({ store }) => {
    // Trigger validation when secret changes (since apiKey value doesn't change on secret edits)
    React.useEffect(() => {
      if (store.settings.polly_secretAccessKey) {
        store.checkApiKey();
      }
    }, [store.settings.polly_secretAccessKey, store]);

    return (
      <>
        <TextInputSetting
          name="AWS Access Key ID"
          description={
            <>
              Your AWS Access Key ID for Polly. Create/manage in AWS IAM → Users
              → your user → Security credentials → Access keys (console:{" "}
              <a href="https://console.aws.amazon.com/iam/" target="_blank">
                https://console.aws.amazon.com/iam/
              </a>
              ).
            </>
          }
          store={store}
          provider="polly"
          fieldName="polly_accessKeyId"
          placeholder="AKIA..."
        />
        <ApiKeyComponent
          store={store}
          provider="polly"
          fieldName="polly_secretAccessKey"
          displayName="AWS Secret Access Key"
          helpText="Your AWS Secret Access Key for Polly. Shown only once when you create the key in AWS IAM; generate under Users → Security credentials → Access keys."
          showValidation={true}
        />
      </>
    );
  },
);

const AwsProfile: React.FC<{
  store: TTSPluginSettingsStore;
  runtime: RuntimeServices;
}> = observer(({ store, runtime }) => {
  const [refreshing, setRefreshing] = React.useState(false);
  const [message, setMessage] = React.useState<string | undefined>();
  const [profiles, setProfiles] = React.useState<string[]>([]);
  const profile = store.settings.polly_profile;
  const awsCliPath = store.settings.polly_awsCliPath;
  const refreshCommand = store.settings.polly_refreshCommand;

  React.useEffect(() => {
    let cancelled = false;
    runtime.awsProfiles
      .listProfiles(awsCliPath)
      .then((profileNames) => {
        if (!cancelled) {
          setProfiles(profileNames);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [awsCliPath, runtime]);

  React.useEffect(() => {
    store.checkApiKey();
  }, [awsCliPath, profile, store]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setMessage(undefined);
    const result = await runtime.awsProfiles.refreshCredentials(refreshCommand);
    setRefreshing(false);
    setMessage(
      result.ok
        ? "Credentials refreshed successfully."
        : result.error || "Refresh command failed.",
    );
    if (result.ok) {
      store.checkApiKey();
    }
  }, [refreshCommand, runtime, store]);

  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">AWS Profile Name</div>
          <div className="setting-item-description">
            The local AWS profile to resolve credentials from.
          </div>
        </div>
        <div className="setting-item-control">
          <OptionSelect
            options={profiles.map((name) => ({ label: name, value: name }))}
            value={profile}
            onChange={(polly_profile) =>
              store.updateSettings({ polly_profile })
            }
          />
        </div>
      </div>
      <DeviceTextInput
        name="AWS CLI Path"
        description="Optional. Leave blank to auto-discover aws from Obsidian's PATH, your login shell, or Windows PATH."
        value={awsCliPath}
        placeholder="aws"
        onChange={(polly_awsCliPath) =>
          store.updateSettings({ polly_awsCliPath })
        }
      />
      <DeviceTextInput
        name="Advanced Refresh Command"
        description="Optional. Leave blank unless this profile needs a custom SSO login command, such as aws sso login --sso-session name."
        value={refreshCommand}
        onChange={(polly_refreshCommand) =>
          store.updateSettings({ polly_refreshCommand })
        }
      />
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Refresh Credentials</div>
          <div className="setting-item-description">
            Run the advanced refresh command on this device.
            {message && <div>{message}</div>}
          </div>
        </div>
        <div className="setting-item-control">
          <button
            onClick={refresh}
            disabled={
              refreshing ||
              !runtime.awsProfiles.available ||
              !refreshCommand.trim()
            }
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </>
  );
});

const DeviceTextInput: React.FC<{
  name: string;
  description: React.ReactNode;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}> = ({ name, description, value, placeholder, onChange }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">{name}</div>
        <div className="setting-item-description">{description}</div>
      </div>
      <div className="setting-item-control">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
};

const PollyRegionComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    const options = POLLY_REGIONS.map((region) => ({
      label: region,
      value: region,
    }));
    return (
      <OptionSelectSetting
        name="Region"
        description="The AWS region for Polly."
        store={store}
        provider="polly"
        fieldName="polly_region"
        options={options}
      />
    );
  });

const PollyVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
  runtime: RuntimeServices;
}> = observer(({ store, runtime }) => {
  const [voices, setVoices] = React.useState<PollyVoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const region = store.settings.polly_region;
  const selectedEngine = store.settings.polly_engine;
  const {
    polly_accessKeyId,
    polly_authMode,
    polly_awsCliPath,
    polly_profile,
    polly_secretAccessKey,
  } = store.settings;

  React.useEffect(() => {
    if (!region) {
      setVoices([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const fetchVoices = async () => {
      setError(null);
      try {
        const credentials = await resolvePollyCredentials(
          store.settings,
          runtime,
        );
        if (cancelled) return;
        if (typeof credentials === "string") {
          setVoices([]);
          setError(credentials);
          return;
        }
        const fetchedVoices = await listPollyVoicesWithCredentials(
          credentials,
          region,
        );
        if (cancelled) return;
        setVoices(fetchedVoices);

        const currentVoice = store.settings.polly_voiceId;
        if (
          fetchedVoices.length > 0 &&
          !fetchedVoices.find((v) => v.id === currentVoice)
        ) {
          store.updateModelSpecificSettings("polly", {
            polly_voiceId: fetchedVoices[0].id,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch Polly voices:", err);
        setError(
          "Failed to load voices. Please check your AWS credentials and region.",
        );
        setVoices([]);
      }
    };

    fetchVoices();
    return () => {
      cancelled = true;
    };
  }, [
    polly_accessKeyId,
    polly_authMode,
    polly_awsCliPath,
    polly_profile,
    polly_secretAccessKey,
    region,
    runtime,
  ]);

  const filteredVoices = React.useMemo(() => {
    if (!selectedEngine) return voices;
    return voices.filter((v) =>
      (v.supportedEngines?.length ?? 0) === 0
        ? true
        : v.supportedEngines?.includes(selectedEngine),
    );
  }, [voices, selectedEngine]);

  React.useEffect(() => {
    const currentVoiceId = store.settings.polly_voiceId;
    if (!currentVoiceId) return;
    const isCompatible = filteredVoices.some((v) => v.id === currentVoiceId);
    if (!isCompatible && filteredVoices.length > 0) {
      store.updateModelSpecificSettings("polly", {
        polly_voiceId: filteredVoices[0].id,
      });
    }
  }, [filteredVoices, store]);

  const voiceOptions = filteredVoices.map((v) => ({
    label: `${v.name} - ${v.languageName}`,
    value: v.id,
  }));

  if (error) {
    return (
      <div>
        <p style={{ color: "var(--text-error)" }}>{error}</p>
      </div>
    );
  }

  const canLoad =
    store.settings.polly_authMode === "profile"
      ? runtime.awsProfiles.available
      : !!store.settings.polly_accessKeyId &&
        !!store.settings.polly_secretAccessKey;

  if (!canLoad || !region) {
    return (
      <div>
        <p>Enter credentials and select a region to load voices.</p>
      </div>
    );
  }

  if (!selectedEngine) {
    return (
      <div>
        <p>Select an engine first to see compatible voices.</p>
      </div>
    );
  }

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Polly voice to use."
      store={store}
      provider="polly"
      fieldName="polly_voiceId"
      options={voiceOptions}
    />
  );
});

const PollyEngineComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    return (
      <OptionSelectSetting
        name="Engine"
        description="Polly engine for synthesis."
        store={store}
        provider="polly"
        fieldName="polly_engine"
        options={POLLY_ENGINES}
      />
    );
  });
