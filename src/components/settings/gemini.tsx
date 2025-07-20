import React from "react";
import { TTSPluginSettingsStore } from "src/player/TTSPluginSettings";
import { observer } from "mobx-react-lite";
import { ApiKeyComponent } from "./api-key-component";
import { OptionSelect } from "./option-select";

export function GeminiSettings({ store }: { store: TTSPluginSettingsStore }) {
  return (
    <>
      <h1>Google Gemini</h1>
      <GeminiApiKeyComponent store={store} />
      <GeminiModelComponent store={store} />
      <GeminiVoiceComponent store={store} />
      <GeminiTTSInstructionsComponent store={store} />
      <GeminiContextModeComponent store={store} />
    </>
  );
}
const GeminiApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <ApiKeyComponent
      store={store}
      provider="gemini"
      fieldName="gemini_apiKey"
      displayName="Gemini API key"
      helpUrl="https://aistudio.google.com/apikey"
      showValidation={true}
    />
  );
});

interface GeminiModel {
  label: string;
  value: string;
}

const DEFAULT_GEMINI_MODELS: GeminiModel[] = [
  {
    label: "Gemini 2.5 Flash Preview Text-to-Speech",
    value: "gemini-2.5-flash-preview-tts",
  },
  {
    label: "Gemini 2.5 Pro Preview Text-to-Speech",
    value: "gemini-2.5-pro-preview-tts",
  },
] as const;

const GeminiModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Model</div>
        <div className="setting-item-description">
          The Gemini TTS model to use
        </div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_GEMINI_MODELS}
          value={store.settings.gemini_ttsModel}
          onChange={(v) =>
            store.updateModelSpecificSettings("gemini", {
              gemini_ttsModel: v,
            })
          }
        />
      </div>
    </div>
  );
});

const GeminiVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  interface Voice {
    label: string;
    value: string;
    models: string[];
  }
  const DEFAULT_GEMINI_VOICES: Voice[] = [
    {
      label: "Zephyr — Bright",
      value: "Zephyr",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Puck — Upbeat",
      value: "Puck",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Charon — Informative",
      value: "Charon",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Kore — Firm",
      value: "Kore",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Fenrir — Excitable",
      value: "Fenrir",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Leda — Youthful",
      value: "Leda",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Orus — Firm",
      value: "Orus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Aoede — Breezy",
      value: "Aoede",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Callirrhoe — Easy-going",
      value: "Callirrhoe",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Autonoe — Bright",
      value: "Autonoe",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Enceladus — Breathy",
      value: "Enceladus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Iapetus — Clear",
      value: "Iapetus",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Umbriel — Easy-going",
      value: "Umbriel",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Algieba — Smooth",
      value: "Algieba",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Despina — Smooth",
      value: "Despina",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
    {
      label: "Erinome — Clear",
      value: "Erinome",
      models: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
    },
  ] as const;

  const voices = React.useMemo(() => {
    return DEFAULT_GEMINI_VOICES.filter((v) =>
      v.models.includes(store.settings.gemini_ttsModel),
    );
  }, [store.settings.gemini_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.gemini_ttsVoice)) {
      return;
    }
    store.updateModelSpecificSettings("gemini", {
      gemini_ttsVoice: voices[0].value,
    });
  }, [store.settings.gemini_ttsVoice, voices]);

  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice</div>
        <div className="setting-item-description">The voice option to use</div>
      </div>
      <div className="setting-item-control">
        <OptionSelect
          options={DEFAULT_GEMINI_VOICES}
          value={store.settings.gemini_ttsVoice}
          onChange={(v) =>
            store.updateModelSpecificSettings("gemini", {
              gemini_ttsVoice: v,
            })
          }
        />
      </div>
    </div>
  );
});

const GeminiTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("gemini", {
        gemini_ttsInstructions: evt.target.value,
      });
    }, []);

  const instructions = store.settings.gemini_ttsInstructions;

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

const GeminiContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (evt) => {
        store.updateModelSpecificSettings("gemini", {
          gemini_contextMode: evt.target.checked,
        });
      },
      [store],
    );
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Context Mode</div>
        <div className="setting-item-description">
          Enable context mode to improve coherence across sentences.
        </div>
      </div>
      <div className="setting-item-control">
        <input
          type="checkbox"
          checked={store.settings.gemini_contextMode}
          onChange={onChange}
        />
      </div>
    </div>
  );
});
