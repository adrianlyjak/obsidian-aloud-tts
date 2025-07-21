import { observer } from "mobx-react-lite";
import React from "react";
import { OPENAI_API_URL } from "../../../models/openai";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { TextInputSetting } from "../setting-components";

export const OpenAICompatibleSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <h1>OpenAI Compatible API</h1>
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
