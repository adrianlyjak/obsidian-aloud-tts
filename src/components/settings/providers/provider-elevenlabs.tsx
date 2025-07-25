import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting } from "../setting-components";
import {
  listElevenLabsVoices,
  listElevenLabsModels,
} from "../../../models/elevenlabs";

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
  const [voices, setVoices] = React.useState<
    { id: string; name: string; category: string }[]
  >([]);
  const [error, setError] = React.useState<string | null>(null);

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
        const fetchedVoices = await listElevenLabsVoices(apiKey);
        setVoices(fetchedVoices);

        // If current voice is not in the list, reset to first available
        const currentVoice = store.settings.elevenlabs_voice;
        if (
          fetchedVoices.length > 0 &&
          !fetchedVoices.find((v) => v.id === currentVoice)
        ) {
          store.updateModelSpecificSettings("elevenlabs", {
            elevenlabs_voice: fetchedVoices[0].id,
          });
        }
      } catch (err) {
        console.error("Failed to fetch ElevenLabs voices:", err);
        setError("Failed to load voices. Please check your API key.");
        setVoices([]);
      }
    };

    fetchVoices();
  }, [apiKey, store]);

  // Group voices by category for better organization
  const groupedVoices = voices.reduce(
    (acc, voice) => {
      const category = voice.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        label: voice.name,
        value: voice.id,
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
    <OptionSelectSetting
      name="Voice"
      description="The ElevenLabs voice to use"
      store={store}
      provider="elevenlabs"
      fieldName="elevenlabs_voice"
      options={voiceOptions}
    />
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
