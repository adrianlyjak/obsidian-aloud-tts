import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { ApiKeyComponent } from "./api-key-component";
import { OptionSelect } from "./option-select";

export function OpenAISettings({ store }: { store: TTSPluginSettingsStore }) {
  return (
    <>
      <h1>OpenAI</h1>
      <OpenAIApiKeyComponent store={store} />
      <OpenAIModelComponent store={store} />
      <OpenAIVoiceComponent store={store} />
      <OpenAITTSInstructionsComponent store={store} />
    </>
  );
}

const OpenAIApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <ApiKeyComponent
      store={store}
      provider="openai"
      fieldName="openai_apiKey"
      displayName="OpenAI API key"
      helpUrl="https://platform.openai.com/api-keys"
      showValidation={true}
    />
  );
});

interface OpenAIModel {
  label: string;
  value: string;
  supportsInstructions?: boolean;
}

const DEFAULT_OPENAI_MODELS: OpenAIModel[] = [
  {
    label: "gpt-4o-mini-tts",
    value: "gpt-4o-mini-tts",
    supportsInstructions: true,
  },
  { label: "tts-1", value: "tts-1" },
  { label: "tts-1-hd", value: "tts-1-hd" },
] as const;

const OpenAIModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Model</div>
        <div className="setting-item-description">
          The OpenAI TTS model to use
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_OPENAI_MODELS}
          value={store.settings.openai_ttsModel}
          onChange={(v) =>
            store.updateModelSpecificSettings("openai", {
              openai_ttsModel: v,
            })
          }
        />
      </div>
    </div>
  );
});

const OpenAIVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  interface Voice {
    label: string;
    value: string;
    models: string[];
  }
  const DEFAULT_OPENAI_VOICES: Voice[] = [
    {
      label: "Alloy",
      value: "alloy",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Ash",
      value: "ash",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Ballad",
      value: "ballad",
      models: ["gpt-4o-mini-tts"],
    },
    {
      label: "Coral",
      value: "coral",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Echo",
      value: "echo",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Fable",
      value: "fable",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Onyx",
      value: "onyx",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Nova",
      value: "nova",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Sage",
      value: "sage",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Shimmer",
      value: "shimmer",
      models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    },
    {
      label: "Verse",
      value: "verse",
      models: ["gpt-4o-mini-tts"],
    },
  ] as const;

  const voices = React.useMemo(() => {
    return DEFAULT_OPENAI_VOICES.filter((v) =>
      v.models.includes(store.settings.openai_ttsModel),
    );
  }, [store.settings.openai_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.openai_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("openai", {
      openai_ttsVoice: voices[0].value,
    });
  }, [store.settings.openai_ttsVoice, voices]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_OPENAI_VOICES}
          value={store.settings.openai_ttsVoice}
          onChange={(v) =>
            store.updateModelSpecificSettings("openai", {
              openai_ttsVoice: v,
            })
          }
        />
      </div>
    </div>
  );
});

const OpenAITTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("openai", {
        openai_ttsInstructions: evt.target.value,
      });
    }, []);

  const modelSupportsInstructions = React.useMemo(() => {
    const model = DEFAULT_OPENAI_MODELS.find(
      (x) => x.value === store.settings.openai_ttsModel,
    );
    return model?.supportsInstructions || false;
  }, [store.settings.openai_ttsModel]);

  const disabled = !modelSupportsInstructions;

  const instructions = modelSupportsInstructions
    ? store.settings.openai_ttsInstructions
    : "";

  return (
    <div className="setting-item tts-settings-block">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Instructions</div>
        <div className="setting-item-description">
          Optional instructions to customize the tone and style of the voice
          (only supported by some models)
        </div>
      </div>
      <textarea
        value={instructions}
        disabled={disabled}
        onChange={onChange}
        placeholder="Example: Speak in a whisper"
        rows={3}
        className="tts-instructions-textarea"
      />
    </div>
  );
});
