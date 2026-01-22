import { observer } from "mobx-react-lite";
import React from "react";
import {
  PollyAuthMode,
  TTSPluginSettingsStore,
} from "../../../player/TTSPluginSettings";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";
import { ApiKeyComponent } from "../api-key-component";
import {
  listPollyVoicesWithCreds,
  POLLY_REGIONS,
  POLLY_ENGINES,
  PollyVoice,
} from "../../../models/polly";
import {
  isDesktopApp,
  readProfileCredentials,
  runRefreshCommand,
} from "../../../models/aws-profile";
import { OptionSelect } from "../option-select";

const AUTH_MODE_OPTIONS: readonly { label: string; value: PollyAuthMode }[] = [
  { label: "Static Credentials", value: "static" },
  { label: "AWS Profile", value: "profile" },
];

export const PollySettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <AuthModeSelector store={store} />
        {store.settings.polly_authMode === "static" ? (
          <StaticCredentials store={store} />
        ) : (
          <ProfileCredentials store={store} />
        )}
        <PollyRegionComponent store={store} />
        <PollyEngineComponent store={store} />
        <PollyVoiceComponent store={store} />
      </>
    );
  },
);

const AuthModeSelector: React.FC<{ store: TTSPluginSettingsStore }> = observer(
  ({ store }) => {
    const isDesktop = isDesktopApp();

    const onChange = React.useCallback(
      (value: string) => {
        if (value === "profile" && !isDesktop) {
          return; // Don't allow profile mode on non-desktop
        }
        store.updateModelSpecificSettings("polly", {
          polly_authMode: value as PollyAuthMode,
        });
      },
      [store, isDesktop],
    );

    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Authentication Mode</div>
          <div className="setting-item-description">
            Use static AWS credentials or read from an AWS profile.
            {!isDesktop && (
              <div style={{ color: "var(--text-warning)", marginTop: "4px" }}>
                AWS Profile mode is only available on desktop.
              </div>
            )}
          </div>
        </div>
        <div className="setting-item-control">
          <OptionSelect
            options={AUTH_MODE_OPTIONS.map((opt) => ({
              ...opt,
              disabled: opt.value === "profile" && !isDesktop,
            }))}
            value={store.settings.polly_authMode}
            onChange={onChange}
          />
        </div>
      </div>
    );
  },
);

const StaticCredentials: React.FC<{ store: TTSPluginSettingsStore }> = observer(
  ({ store }) => {
    // Trigger validation when secret changes
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

const ProfileCredentials: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    const [refreshing, setRefreshing] = React.useState(false);
    const [refreshError, setRefreshError] = React.useState<string | null>(null);
    const [refreshSuccess, setRefreshSuccess] = React.useState(false);

    // Trigger validation when profile changes
    React.useEffect(() => {
      if (store.settings.polly_profile) {
        store.checkApiKey();
      }
    }, [store.settings.polly_profile, store]);

    const handleRefresh = React.useCallback(async () => {
      const command = store.settings.polly_refreshCommand;
      if (!command.trim()) {
        setRefreshError("No refresh command configured");
        return;
      }

      setRefreshing(true);
      setRefreshError(null);
      setRefreshSuccess(false);

      try {
        const result = await runRefreshCommand(command);
        if (result.success) {
          setRefreshSuccess(true);
          // Re-validate credentials after refresh
          store.checkApiKey();
          // Clear success message after 3 seconds
          setTimeout(() => setRefreshSuccess(false), 3000);
        } else {
          setRefreshError(result.error || "Refresh failed");
        }
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : String(error));
      } finally {
        setRefreshing(false);
      }
    }, [store]);

    return (
      <>
        <TextInputSetting
          name="AWS Profile Name"
          description={
            <>
              The name of the AWS profile to use from{" "}
              <code>~/.aws/credentials</code>. Use &quot;default&quot; for the
              default profile.
            </>
          }
          store={store}
          provider="polly"
          fieldName="polly_profile"
          placeholder="default"
        />
        <TextInputSetting
          name="Refresh Command"
          description={
            <>
              Command to run when credentials expire (e.g.,{" "}
              <code>mwinit -s -f</code> or <code>aws sso login</code>). Leave
              empty to disable automatic refresh.
            </>
          }
          store={store}
          provider="polly"
          fieldName="polly_refreshCommand"
          placeholder="mwinit -s -f"
        />
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Manual Refresh</div>
            <div className="setting-item-description">
              Run the refresh command manually to update credentials.
              {refreshError && (
                <div style={{ color: "var(--text-error)", marginTop: "4px" }}>
                  {refreshError}
                </div>
              )}
              {refreshSuccess && (
                <div style={{ color: "var(--text-success)", marginTop: "4px" }}>
                  Credentials refreshed successfully!
                </div>
              )}
            </div>
          </div>
          <div className="setting-item-control">
            <button
              onClick={handleRefresh}
              disabled={
                refreshing || !store.settings.polly_refreshCommand.trim()
              }
            >
              {refreshing ? "Refreshing..." : "Refresh Credentials"}
            </button>
          </div>
        </div>
      </>
    );
  });

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

const PollyVoiceComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    const [voices, setVoices] = React.useState<PollyVoice[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    const authMode = store.settings.polly_authMode;
    const accessKeyId = store.settings.polly_accessKeyId;
    const secretAccessKey = store.settings.polly_secretAccessKey;
    const profile = store.settings.polly_profile;
    const region = store.settings.polly_region;
    const selectedEngine = store.settings.polly_engine;

    React.useEffect(() => {
      const fetchVoices = async () => {
        setError(null);
        setLoading(true);

        try {
          let credentials;

          if (authMode === "profile") {
            credentials = await readProfileCredentials(profile);
            if (!credentials) {
              setError(
                `Could not read credentials from profile "${profile}". Make sure it exists in ~/.aws/credentials`,
              );
              setVoices([]);
              setLoading(false);
              return;
            }
          } else {
            if (!accessKeyId || !secretAccessKey) {
              setVoices([]);
              setLoading(false);
              return;
            }
            credentials = { accessKeyId, secretAccessKey };
          }

          const fetchedVoices = await listPollyVoicesWithCreds(
            credentials,
            region,
          );
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
          console.error("Failed to fetch Polly voices:", err);
          setError(
            "Failed to load voices. Please check your AWS credentials and region.",
          );
          setVoices([]);
        } finally {
          setLoading(false);
        }
      };

      // Only fetch if we have the minimum required config
      if (authMode === "profile" ? profile : accessKeyId && secretAccessKey) {
        fetchVoices();
      } else {
        setVoices([]);
        setError(null);
      }
    }, [authMode, accessKeyId, secretAccessKey, profile, region, store]);

    const filteredVoices = React.useMemo(() => {
      if (!selectedEngine) return voices;
      return voices.filter((v) =>
        (v.supportedEngines?.length ?? 0) === 0
          ? true
          : v.supportedEngines?.includes(selectedEngine),
      );
    }, [voices, selectedEngine]);

    // Auto-correct incompatible voice selection when engine changes or voices load
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

    if (loading) {
      return (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Voice</div>
            <div className="setting-item-description">Loading voices...</div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Voice</div>
            <div
              className="setting-item-description"
              style={{ color: "var(--text-error)" }}
            >
              {error}
            </div>
          </div>
        </div>
      );
    }

    const hasCredentials =
      authMode === "profile" ? !!profile : !!accessKeyId && !!secretAccessKey;

    if (!hasCredentials) {
      return (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Voice</div>
            <div className="setting-item-description">
              {authMode === "profile"
                ? "Enter a profile name to load voices."
                : "Enter credentials to load voices."}
            </div>
          </div>
        </div>
      );
    }

    if (!selectedEngine) {
      return (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Voice</div>
            <div className="setting-item-description">
              Select an engine first to see compatible voices.
            </div>
          </div>
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
