import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, CheckboxSetting } from "../setting-components";
import {
  listAzureVoices,
  AZURE_REGIONS,
  AZURE_OUTPUT_FORMATS,
} from "../../../models/azure";

export const AzureSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="azure"
          fieldName="azure_apiKey"
          displayName="Azure Speech API key"
          helpText={
            <>
              Your Azure Speech Services API key. You can get one{" "}
              <a
                href="https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices"
                target="_blank"
              >
                here
              </a>
              .
            </>
          }
          showValidation={true}
        />
        <AzureRegionComponent store={store} />
        <AzureVoiceComponent store={store} />
        <AzureOutputFormatComponent store={store} />
        <AzureContextModeComponent store={store} />
      </>
    );
  },
);

const AzureRegionComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const regionOptions = AZURE_REGIONS.map((region) => ({
    label: region.charAt(0).toUpperCase() + region.slice(1),
    value: region,
  }));

  return (
    <OptionSelectSetting
      name="Region"
      description="The Azure region for your Speech Services resource"
      store={store}
      provider="azure"
      fieldName="azure_region"
      options={regionOptions}
    />
  );
});

const AzureVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<
    { id: string; name: string; gender: string; locale: string }[]
  >([]);
  const [error, setError] = React.useState<string | null>(null);

  const apiKey = store.settings.azure_apiKey;
  const region = store.settings.azure_region;

  React.useEffect(() => {
    if (!apiKey || !region) {
      setVoices([]);
      setError(null);
      return;
    }

    const fetchVoices = async () => {
      setError(null);
      try {
        const fetchedVoices = await listAzureVoices(apiKey, region);
        setVoices(fetchedVoices);

        // If current voice is not in the list, reset to first available
        const currentVoice = store.settings.azure_voice;
        if (
          fetchedVoices.length > 0 &&
          !fetchedVoices.find((v) => v.id === currentVoice)
        ) {
          store.updateModelSpecificSettings("azure", {
            azure_voice: fetchedVoices[0].id,
          });
        }
      } catch (err) {
        console.error("Failed to fetch Azure voices:", err);
        setError(
          "Failed to load voices. Please check your API key and region.",
        );
        setVoices([]);
      }
    };

    fetchVoices();
  }, [apiKey, region, store]);

  // Group voices by locale for better organization
  const groupedVoices = voices.reduce(
    (acc, voice) => {
      const locale = voice.locale;
      if (!acc[locale]) {
        acc[locale] = [];
      }
      acc[locale].push({
        label: `${voice.name} (${voice.gender})`,
        value: voice.id,
      });
      return acc;
    },
    {} as Record<string, { label: string; value: string }[]>,
  );

  // Flatten for the option select
  const voiceOptions = Object.entries(groupedVoices).flatMap(
    ([locale, localeVoices]) =>
      localeVoices.map((voice) => ({
        ...voice,
        label: `${voice.label} - ${locale}`,
      })),
  );

  if (error) {
    return (
      <div>
        <p style={{ color: "var(--text-error)" }}>{error}</p>
      </div>
    );
  }

  if (!apiKey || !region) {
    return (
      <div>
        <p>Enter your API key and select a region to load available voices.</p>
      </div>
    );
  }

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Azure voice to use for speech synthesis"
      store={store}
      provider="azure"
      fieldName="azure_voice"
      options={voiceOptions}
    />
  );
});

const AzureOutputFormatComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Output Format"
      description="The audio format for the generated speech"
      store={store}
      provider="azure"
      fieldName="azure_outputFormat"
      options={AZURE_OUTPUT_FORMATS}
    />
  );
});

const AzureContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <CheckboxSetting
      name="Context Mode"
      description="Include previous sentences as context to improve speech continuity"
      store={store}
      provider="azure"
      fieldName="azure_contextMode"
    />
  );
});
