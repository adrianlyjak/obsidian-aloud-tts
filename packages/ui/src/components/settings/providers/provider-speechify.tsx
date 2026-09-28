import { observer } from "mobx-react-lite";
import React from "react";
import {
  listSpeechifyVoices,
  SPEECHIFY_MODELS,
  speechifyVoiceOptions,
  SpeechifyVoice,
  TTSPluginSettingsStore,
} from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting } from "../setting-components";

export const SpeechifySettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="speechify"
          fieldName="speechify_apiKey"
          displayName="Speechify API key"
          helpUrl="https://platform.speechify.ai/api-keys"
          showValidation={true}
        />
        <SpeechifyModelComponent store={store} />
        <SpeechifyVoiceComponent store={store} />
      </>
    );
  },
);

const SpeechifyModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Model"
      description="The Speechify TTS model to use. Simba 3.2 is recommended for English; Simba 3.0 adds multilingual support."
      store={store}
      provider="speechify"
      fieldName="speechify_model"
      options={SPEECHIFY_MODELS}
    />
  );
});

const SpeechifyVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<SpeechifyVoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const apiKey = store.settings.speechify_apiKey;
  const model = store.settings.speechify_model;

  React.useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const fetchVoices = async (): Promise<void> => {
      setError(null);
      try {
        const fetchedVoices = await listSpeechifyVoices(apiKey, model);
        if (cancelled) {
          return;
        }
        setVoices(fetchedVoices);

        const currentVoiceExists = fetchedVoices.some(
          (voice) => voice.id === store.settings.speechify_voice,
        );
        if (!currentVoiceExists && fetchedVoices.length > 0) {
          store.updateModelSpecificSettings("speechify", {
            speechify_voice: fetchedVoices[0].id,
          });
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error("Failed to fetch Speechify voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      }
    };

    fetchVoices();
    return () => {
      cancelled = true;
    };
  }, [apiKey, model, store]);

  if (error) {
    return (
      <div>
        <p style={{ color: "var(--text-error)" }}>{error}</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div>
        <p>Enter your API key to load available Speechify voices.</p>
      </div>
    );
  }

  const voiceOptions = speechifyVoiceOptions(voices);

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Speechify voice to use. Voices are loaded from the API and filtered by the selected model."
      store={store}
      provider="speechify"
      fieldName="speechify_voice"
      options={voiceOptions}
    />
  );
});
