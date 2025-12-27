import { observer } from "mobx-react-lite";
import React from "react";
import { OPENAI_API_URL } from "../../../models/openai";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";

const AUDIO_FORMAT_OPTIONS = [
  { label: "MP3", value: "mp3" },
  { label: "WAV", value: "wav" },
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
          description="The model parameter"
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsModel"
        />
        <TextInputSetting
          name="Custom OpenAI Voice"
          description="The voice parameter"
          store={store}
          provider="openaicompat"
          fieldName="openaicompat_ttsVoice"
        />
        <OptionSelectSetting
          name="Audio Format"
          description="The audio format to request from the API"
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
      description="Base url for openai compatible API"
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
