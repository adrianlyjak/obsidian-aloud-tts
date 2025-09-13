import { observer } from "mobx-react-lite";
import React, { useCallback } from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting } from "../setting-components";
import {
  listElevenLabsVoices,
  listElevenLabsModels,
  ElevenLabsVoice,
} from "../../../models/elevenlabs";
import { OptionSelect } from "../option-select";

export const ElevenLabsSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="elevenlabs"
          fieldName="elevenlabs_apiKey"
          displayName="ElevenLabs API key"
          helpText={
            <>
              Your ElevenLabs API key. You can get one{" "}
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
              >
                here
              </a>
              .
            </>
          }
          showValidation={true}
        />
        <ElevenLabsModelComponent store={store} />
        <ElevenLabsVoiceComponent store={store} />
        <ElevenLabsStabilityComponent store={store} />
        <ElevenLabsSimilarityComponent store={store} />
      </>
    );
  },
);

// Add fallback options if no API key
const fallbackOptions = [
  { name: "Eleven Multilingual v2", id: "eleven_multilingual_v2" },
  { name: "Eleven Flash v2.5", id: "eleven_flash_v2.5" },
  { name: "Eleven Turbo v2.5", id: "eleven_turbo_v2.5" },
  { name: "Eleven v3", id: "eleven_v3" },
];

const ElevenLabsModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [models, setModels] = React.useState<{ id: string; name: string }[]>(
    [],
  );

  const apiKey = store.settings.elevenlabs_apiKey;

  React.useEffect(() => {
    if (!apiKey) {
      setModels([]);
      return;
    }

    const fetchModels = async () => {
      try {
        const fetchedModels = await listElevenLabsModels(apiKey);
        setModels(fetchedModels);
      } catch (error) {
        console.error("Failed to fetch ElevenLabs models:", error);
        setModels(fallbackOptions);
      }
    };

    fetchModels();
  }, [apiKey]);

  const modelOptions = (models.length > 0 ? models : fallbackOptions).map(
    (model) => ({
      label: model.name,
      value: model.id,
    }),
  );

  return (
    <OptionSelectSetting
      name="Model"
      description="The ElevenLabs TTS model to use"
      store={store}
      provider="elevenlabs"
      fieldName="elevenlabs_model"
      options={modelOptions}
    />
  );
});

const ElevenLabsVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<ElevenLabsVoice[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [voiceCategory, setVoiceCategory] = React.useState<
    "default" | "non-default"
  >("default");

  const apiKey = store.settings.elevenlabs_apiKey;

  React.useEffect(() => {
    if (!apiKey) {
      setVoices([]);
      setError(null);
      return;
    }

    const fetchVoices = async () => {
      setError(null);
      try {
        const fetchedVoices = await listElevenLabsVoices(apiKey, voiceCategory);
        const prevVoices = voices;
        let prevVoice = prevVoices.find(
          (x) => x.voice_id === store.settings.elevenlabs_voice,
        );
        const currentVoice = fetchedVoices.find(
          (x) => x.voice_id === store.settings.elevenlabs_voice,
        );
        if (!prevVoice && !currentVoice) {
          const otherVoices = await listElevenLabsVoices(
            apiKey,
            voiceCategory === "default" ? "non-default" : "default",
          );
          prevVoice = otherVoices.find(
            (x) => x.voice_id === store.settings.elevenlabs_voice,
          );
        }
        setVoices(
          (prevVoice && !currentVoice ? [prevVoice] : []).concat(fetchedVoices),
        );
        if (!currentVoice && !prevVoice && fetchedVoices.length > 0) {
          store.updateModelSpecificSettings("elevenlabs", {
            elevenlabs_voice: fetchedVoices[0].voice_id,
          });
        }
      } catch (err) {
        console.error("Failed to fetch ElevenLabs voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      }
    };

    fetchVoices();
  }, [apiKey, store, voiceCategory]);

  const handleVoiceUpdated = useCallback((v: string) => {
    setVoiceCategory(v as "default" | "non-default");
  }, []);

  // Group voices by category for better organization
  const groupedVoices = voices.reduce(
    (acc, voice) => {
      const category = voice.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        label: voice.name,
        value: voice.voice_id,
      });
      return acc;
    },
    {} as Record<string, { label: string; value: string }[]>,
  );

  // Flatten for the option select
  const voiceOptions = Object.entries(groupedVoices).flatMap(
    ([category, categoryVoices]) =>
      categoryVoices.map((voice) => ({
        ...voice,
        label: `${voice.label} (${category})`,
      })),
  );

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
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Voice Category</div>
          <div className="setting-item-description">
            Switch between Custom Voices or Default Voices
          </div>
        </div>
        <div className="setting-item-control">
          <OptionSelect
            options={[
              { label: "Default", value: "default" },
              { label: "Custom", value: "non-default" },
            ]}
            value={voiceCategory}
            onChange={handleVoiceUpdated}
          />
        </div>
      </div>
      <OptionSelectSetting
        name="Voice"
        description="The ElevenLabs voice to use"
        store={store}
        provider="elevenlabs"
        fieldName="elevenlabs_voice"
        options={voiceOptions}
      />
    </>
  );
});

const ElevenLabsStabilityComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (evt) => {
        store.updateModelSpecificSettings("elevenlabs", {
          elevenlabs_stability: parseFloat(evt.target.value),
        });
      },
      [store],
    );

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">
          Stability ({store.settings.elevenlabs_stability})
        </div>
        <div className="setting-item-description">
          Higher values make the voice more stable and consistent. Lower values
          make it more variable and expressive.
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={store.settings.elevenlabs_stability || 0.5}
          onChange={onChange}
        />
      </div>
    </div>
  );
});

const ElevenLabsSimilarityComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (evt) => {
        store.updateModelSpecificSettings("elevenlabs", {
          elevenlabs_similarity: parseFloat(evt.target.value),
        });
      },
      [store],
    );

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">
          Similarity Boost ({store.settings.elevenlabs_similarity})
        </div>
        <div className="setting-item-description">
          Higher values make the AI stick closer to the original voice. Lower
          values allow more creative interpretation.
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={store.settings.elevenlabs_similarity || 0.75}
          onChange={onChange}
        />
      </div>
    </div>
  );
});
