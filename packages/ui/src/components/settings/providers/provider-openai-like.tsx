import { observer } from "mobx-react-lite";
import React from "react";
import { OPENAI_API_URL } from "open-tts";
import { TTSPluginSettingsStore } from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import {
  OptionSelectSetting,
  TextInputSetting,
  SliderSetting,
} from "../setting-components";

const AUDIO_FORMAT_OPTIONS = [
  { label: "MP3", value: "mp3" },
  { label: "WAV", value: "wav" },
  { label: "PCM", value: "pcm" },
] as const;

export const OpenAICompatibleSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_apiKey"
          displayName="API key"
          helpText="A Bearer token for your API"
        />
        <OpenAICompatibleAPIBaseURLComponent store={store} />
        <TextInputSetting
          name="Model"
          description="The model parameter."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsModel"
        />
        <TextInputSetting
          name="Custom OpenAI Voice"
          description="The voice parameter."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsVoice"
        />
        <SliderSetting
          name="Generation Speed"
          description="Generation speed sent to the TTS API when creating audio. This is different from the local playback speed control. Support depends on the provider/model; it works with some OpenRouter TTS models such as Kokoro."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_generationSpeed"
          min={0.3}
          max={2.5}
          step={0.05}
          defaultValue={1}
          formatValue={(value) => `${value.toFixed(2)}x`}
        />
        <OptionSelectSetting
          name="Audio Format"
          description="The audio format to request from the API."
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_responseFormat"
          options={AUDIO_FORMAT_OPTIONS}
        />
      </>
    );
  },
);

const OpenAICompatibleAPIBaseURLComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  function isValidURL(url: string) {
    if (!url) {
      return true;
    }
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  return (
    <TextInputSetting
      name="API URL"
      description="Base URL for OpenAI compatible API."
      store={store}
      fieldName="openaicompat_apiBase"
      placeholder={OPENAI_API_URL}
      validation={{
        validate: isValidURL,
        errorMessage: "Please enter a valid URL (e.g. https://api.example.com)",
      }}
    />
  );
});
