import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";
import {
  listPollyVoices,
  POLLY_REGIONS,
  POLLY_OUTPUT_FORMATS,
  POLLY_ENGINES,
  PollyVoice,
} from "../../../models/polly";

export const PollySettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <AwsCredentials store={store} />
        <PollyRegionComponent store={store} />
        <PollyVoiceComponent store={store} />
        <PollyEngineComponent store={store} />
        <PollyOutputFormatComponent store={store} />
      </>
    );
  },
);

const AwsCredentials: React.FC<{ store: TTSPluginSettingsStore }> = observer(
  ({ store }) => {
    return (
      <>
        <TextInputSetting
          name="AWS Access Key ID"
          description="Your AWS Access Key ID for Polly"
          store={store}
          provider="polly"
          fieldName="polly_accessKeyId"
          placeholder="AKIA..."
        />
        <TextInputSetting
          name="AWS Secret Access Key"
          description="Your AWS Secret Access Key for Polly"
          store={store}
          provider="polly"
          fieldName="polly_secretAccessKey"
          placeholder="********"
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

    const voiceOptions = voices.map((v) => ({
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

const PollyOutputFormatComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    return (
      <OptionSelectSetting
        name="Output Format"
        description="Audio output format"
        store={store}
        provider="polly"
        fieldName="polly_outputFormat"
        options={POLLY_OUTPUT_FORMATS}
      />
    );
  });
