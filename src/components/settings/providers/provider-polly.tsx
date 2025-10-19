import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";
import { ApiKeyComponent } from "../api-key-component";
import {
  listPollyVoices,
  POLLY_REGIONS,
  POLLY_ENGINES,
  PollyVoice,
} from "../../../models/polly";

export const PollySettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <AwsCredentials store={store} />
        <PollyRegionComponent store={store} />
        <PollyEngineComponent store={store} />
        <PollyVoiceComponent store={store} />
      </>
    );
  },
);

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

const PollyRegionComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    const options = POLLY_REGIONS.map((region) => ({
      label: region,
      value: region,
    }));
    return (
      <OptionSelectSetting
        name="Region"
        description="The AWS region for Polly"
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

    const accessKeyId = store.settings.polly_accessKeyId;
    const secretAccessKey = store.settings.polly_secretAccessKey;
    const region = store.settings.polly_region;
    const selectedEngine = store.settings.polly_engine;

    React.useEffect(() => {
      if (!accessKeyId || !secretAccessKey || !region) {
        setVoices([]);
        setError(null);
        return;
      }

      const fetchVoices = async () => {
        setError(null);
        try {
          const fetchedVoices = await listPollyVoices(
            accessKeyId,
            secretAccessKey,
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
        }
      };

      fetchVoices();
    }, [accessKeyId, secretAccessKey, region, store]);

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

    if (error) {
      return (
        <div>
          <p style={{ color: "var(--text-error)" }}>{error}</p>
        </div>
      );
    }

    if (!accessKeyId || !secretAccessKey || !region) {
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
        description="The Polly voice to use"
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
        description="Polly engine for synthesis"
        store={store}
        provider="polly"
        fieldName="polly_engine"
        options={POLLY_ENGINES}
      />
    );
  });
