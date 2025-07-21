import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { observer } from "mobx-react-lite";
import { ApiKeyComponent } from "../api-key-component";
import {
  OptionSelectSetting,
  TextInputSetting,
  TextareaSetting,
  CheckboxSetting,
} from "../setting-components";
import { listModels } from "../../../models/hume";

export const HumeSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="hume"
          fieldName="hume_apiKey"
          displayName="Hume API key"
          helpText={
            <>
              Your Hume API key. You can get one{" "}
              <a href="https://platform.hume.ai/settings/keys" target="_blank">
                here
              </a>
              .
            </>
          }
          showValidation={true}
        />
        <OptionSelectSetting
          name="Provider"
          description="Choose between Hume's preset voices or your own custom voices."
          store={store}
          provider="hume"
          fieldName="hume_sourceType"
          options={[
            { label: "Hume", value: "HUME_AI" },
            { label: "Custom Voice", value: "CUSTOM_VOICE" },
          ]}
        />
        <HumeVoiceComponent store={store} />
        <HumeTTSInstructionsComponent store={store} />
        <HumeContextModeComponent store={store} />
      </>
    );
  },
);

const HumeVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const provider = store.settings.hume_sourceType as "HUME_AI" | "CUSTOM_VOICE";
  const apiKey = store.settings.hume_apiKey;

  // Fetch voices when provider or API key changes
  React.useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      setError(null);
      return;
    }

    const fetchVoices = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedVoices = await listModels(provider, apiKey);
        setVoices(fetchedVoices);

        // If current voice is not in the list, reset to first available
        const currentVoice = store.settings.hume_ttsVoice;
        if (
          fetchedVoices.length > 0 &&
          !fetchedVoices.find((v) => v.id === currentVoice)
        ) {
          store.updateModelSpecificSettings("hume", {
            hume_ttsVoice: fetchedVoices[0].id,
          });
        }
      } catch (err) {
        console.error("Failed to fetch Hume voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVoices();
  }, [provider, apiKey, store]);

  // Convert voices to option format
  const voiceOptions = voices.map((voice) => ({
    label: voice.name,
    value: voice.id,
  }));

  // If no API key, show text input as fallback
  if (!apiKey) {
    return (
      <TextInputSetting
        name="Hume Voice ID"
        description="Enter your Hume Voice ID (API key required to load voice list)"
        store={store}
        provider="hume"
        fieldName="hume_ttsVoice"
        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
      />
    );
  }

  // If loading, show loading state
  if (loading) {
    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Voice</div>
          <div className="setting-item-description">
            Loading available voices...
          </div>
        </div>
        <div className="setting-item-control">
          <select className="dropdown" disabled>
            <option>Loading...</option>
          </select>
        </div>
      </div>
    );
  }

  // If error or no voices, show text input as fallback
  if (error || voices.length === 0) {
    return (
      <>
        {error && (
          <div
            className="setting-item-description tts-error-text"
            style={{ marginBottom: "0.5rem" }}
          >
            {error}
          </div>
        )}
        <TextInputSetting
          name="Hume Voice ID"
          description="No voices found. Enter your Hume Voice ID manually"
          store={store}
          provider="hume"
          fieldName="hume_ttsVoice"
          placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
        />
      </>
    );
  }

  // Show voice options
  return (
    <OptionSelectSetting
      name="Voice"
      description={`Available ${provider === "HUME_AI" ? "Hume" : "custom"} voices`}
      store={store}
      provider="hume"
      fieldName="hume_ttsVoice"
      options={voiceOptions}
    />
  );
});

const HumeTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <TextareaSetting
      name="Voice Instructions"
      description="Optional instructions to customize the tone and style of the voice"
      store={store}
      provider="hume"
      fieldName="hume_ttsInstructions"
      placeholder="Example: Speak in a whisper"
      rows={3}
    />
  );
});

const HumeContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <CheckboxSetting
      name="Context Mode"
      description="Enable context mode to improve coherence across sentences."
      store={store}
      provider="hume"
      fieldName="hume_contextMode"
    />
  );
});
