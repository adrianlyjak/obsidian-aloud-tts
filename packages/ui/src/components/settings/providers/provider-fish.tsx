import { observer } from "mobx-react-lite";
import React from "react";
import {
  type FishVoice,
  type FishVoiceSource,
  listFishVoices,
  TTSPluginSettingsStore,
} from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelect } from "../option-select";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";

export const FishSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="fish"
          fieldName="fish_apiKey"
          displayName="Fish Audio API key"
          helpUrl="https://fish.audio/app/api-keys"
          showValidation={true}
        />
        <FishModelComponent store={store} />
        <FishVoiceSourceComponent store={store} />
        {store.settings.fish_voiceSource === "my-voices" ? (
          <FishVoiceSelectComponent store={store} />
        ) : (
          <FishCustomVoiceComponent store={store} />
        )}
        <FishSentencePauseComponent store={store} />
      </>
    );
  },
);

const FISH_MODELS = [
  { label: "S2 Pro", value: "s2-pro" },
  { label: "S1", value: "s1" },
] as const;

const FishModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Model"
      description="The Fish Audio TTS model to use."
      store={store}
      provider="fish"
      fieldName="fish_model"
      options={FISH_MODELS}
    />
  );
});

const FishVoiceSourceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange = React.useCallback(
    (value: string) => {
      store.updateModelSpecificSettings("fish", {
        fish_voiceSource: value as FishVoiceSource,
      });
    },
    [store],
  );

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Source</div>
        <div className="setting-item-description">
          Choose from your Fish Audio voices or enter a voice model ID manually.
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={[
            { label: "Custom Voice ID", value: "custom" },
            { label: "My Voices", value: "my-voices" },
          ]}
          value={store.settings.fish_voiceSource}
          onChange={onChange}
        />
      </div>
    </div>
  );
});

const FishVoiceSelectComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<FishVoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const apiKey = store.settings.fish_apiKey;

  React.useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      setError(null);
      return;
    }

    const fetchVoices = async (): Promise<void> => {
      setError(null);
      try {
        const fetchedVoices = await listFishVoices(apiKey, true);
        setVoices(fetchedVoices);

        const currentVoiceExists = fetchedVoices.some(
          (voice) => voice.id === store.settings.fish_voiceId,
        );
        const firstUsableVoice = fetchedVoices.find(
          (voice) => voice.state !== "failed" && voice.state !== "training",
        );

        if (!currentVoiceExists && firstUsableVoice) {
          store.updateModelSpecificSettings("fish", {
            fish_voiceId: firstUsableVoice.id,
          });
        }
      } catch (err) {
        console.error("Failed to fetch Fish Audio voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      }
    };

    fetchVoices();
  }, [apiKey, store]);

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
        <p>Enter your API key to load your Fish Audio voices.</p>
      </div>
    );
  }

  const voiceOptions = voices.map((voice) => ({
    label: `${voice.title} (${voice.visibility})`,
    value: voice.id,
    disabled: voice.state === "failed" || voice.state === "training",
  }));

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Fish Audio voice model to use."
      store={store}
      provider="fish"
      fieldName="fish_voiceId"
      options={voiceOptions}
    />
  );
});

const FishCustomVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <TextInputSetting
      name="Custom Voice ID"
      description="The Fish Audio voice model ID to pass as reference_id. Use this for unlisted voices."
      store={store}
      provider="fish"
      fieldName="fish_voiceId"
      placeholder="e.g. 7f92f8afb8ec43bf81429cc1c9199cb1"
    />
  );
});

const FISH_SENTENCE_PAUSES = [
  { label: "None", value: "none" },
  { label: "Short", value: "short" },
  { label: "Long", value: "long" },
] as const;

const FishSentencePauseComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <OptionSelectSetting
      name="Sentence Pause"
      description="Add Fish Audio pause controls between sentences. Use this when a voice reads at the right pace but moves too quickly into the next sentence."
      store={store}
      provider="fish"
      fieldName="fish_sentencePause"
      options={FISH_SENTENCE_PAUSES}
    />
  );
});
