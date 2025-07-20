import React from "react";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { observer } from "mobx-react-lite";
import { ApiKeyComponent } from "./api-key-component";
import {
  OptionSelectSetting,
  TextareaSetting,
  CheckboxSetting,
} from "./setting-components";

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

const DEFAULT_GEMINI_MODELS = [
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
    <OptionSelectSetting
      name="Model"
      description="The Gemini TTS model to use"
      store={store}
      provider="gemini"
      fieldName="gemini_ttsModel"
      options={DEFAULT_GEMINI_MODELS}
    />
  );
});

const GeminiVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const DEFAULT_GEMINI_VOICES = [
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
      v.models.includes(store.settings.gemini_ttsModel as any),
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
    <OptionSelectSetting
      name="Voice"
      description="The voice option to use"
      store={store}
      provider="gemini"
      fieldName="gemini_ttsVoice"
      options={DEFAULT_GEMINI_VOICES}
    />
  );
});

const GeminiTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <TextareaSetting
      name="Voice Instructions"
      description="Optional instructions to customize the tone and style of the voice"
      store={store}
      provider="gemini"
      fieldName="gemini_ttsInstructions"
      placeholder="Example: Speak in a whisper"
      rows={3}
    />
  );
});

const GeminiContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <CheckboxSetting
      name="Context Mode"
      description="Enable context mode to improve coherence across sentences."
      store={store}
      provider="gemini"
      fieldName="gemini_contextMode"
    />
  );
});
