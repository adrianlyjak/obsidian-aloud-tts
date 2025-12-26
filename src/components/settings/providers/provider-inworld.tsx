import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting } from "../setting-components";
import {
  DEFAULT_INWORLD_MODELS,
  listInworldVoices,
  InworldVoice,
} from "../../../models/inworld";

export const InworldSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="inworld"
          fieldName="inworld_apiKey"
          displayName="Inworld API key"
          helpText={<>Your Inworld API key (Basic Auth base64).</>}
          showValidation={true}
        />
        <InworldModelComponent store={store} />
        <InworldVoiceComponent store={store} />
      </>
    );
  },
);

const InworldModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Model"
      description="The Inworld TTS model to use"
      store={store}
      provider="inworld"
      fieldName="inworld_modelId"
      options={DEFAULT_INWORLD_MODELS}
    />
  );
});

const InworldVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<InworldVoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const apiKey = store.settings.inworld_apiKey;

  React.useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      setError(null);
      return;
    }

    const fetchVoices = async () => {
      setError(null);
      try {
        const fetchedVoices = await listInworldVoices(store.settings);
        setVoices(fetchedVoices);

        // Set default voice if none selected or current selection not in list (and list not empty)
        const currentVoiceId = store.settings.inworld_voiceId;
        const currentVoiceExists = fetchedVoices.some(
          (v) => v.voiceId === currentVoiceId,
        );

        if (!currentVoiceExists && fetchedVoices.length > 0) {
          store.updateModelSpecificSettings("inworld", {
            inworld_voiceId: fetchedVoices[0].voiceId,
          });
        }
      } catch (err) {
        console.error("Failed to fetch Inworld voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      }
    };

    fetchVoices();
  }, [apiKey, store.settings]); // Depend on settings object for latest config

  const voiceOptions = voices.map((voice) => ({
    label: `${voice.displayName}`,
    value: voice.voiceId,
  }));

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
        <p>Enter your API key to load available voices.</p>
      </div>
    );
  }

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Inworld voice to use"
      store={store}
      provider="inworld"
      fieldName="inworld_voiceId"
      options={voiceOptions}
    />
  );
});
