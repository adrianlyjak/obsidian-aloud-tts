import { observer } from "mobx-react-lite";
import React from "react";
import { OPENAI_API_URL } from "../../models/openai";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { ApiKeyComponent } from "./api-key-component";

export function OpenAICompatibleSettings({
  store,
}: {
  store: TTSPluginSettingsStore;
}) {
  return (
    <>
      <h1>OpenAI Compatible API</h1>
      <OpenAICompatibleApiKeyComponent store={store} />
      <OpenAICompatibleAPIBaseURLComponent store={store} />
      <OpenAICompatibleVoiceComponent store={store} />
    </>
  );
}

const OpenAICompatibleApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <ApiKeyComponent
      store={store}
      provider="openaicompat"
      fieldName="openaicompat_apiKey"
      displayName="API key"
      helpText="A Bearer token for your API"
    />
  );
});

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
  const [state, setState] = React.useState({
    raw: store.settings.openaicompat_apiBase,
    valid: isValidURL(store.settings.openaicompat_apiBase),
  });
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback((v: React.ChangeEvent<HTMLInputElement>) => {
      const url = v.target.value;
      const valid = isValidURL(url);
      setState({
        raw: url,
        valid,
      });
      if (valid) {
        store.updateSettings({ openaicompat_apiBase: url });
      }
    }, []);
  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">API URL</div>
          <div className="setting-item-description">
            Base url for openai compatible API
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            placeholder={OPENAI_API_URL}
            value={state.raw}
            onChange={onChange}
            className={!state.valid ? "tts-error-input" : ""}
          />
        </div>
      </div>
      {!state.valid && state.raw && (
        <div
          className="setting-item-description tts-error-text"
          style={{ marginBottom: "0.5rem" }}
        >
          Please enter a valid URL (e.g. https://api.example.com)
        </div>
      )}
    </>
  );
});

const OpenAICompatibleVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Model</div>
          <div className="setting-item-description">The model parameter</div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={store.settings.openaicompat_ttsModel}
            onChange={(evt) =>
              store.updateSettings({ openaicompat_ttsModel: evt.target.value })
            }
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Custom OpenAI Voice</div>
          <div className="setting-item-description">The voice parameter</div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={store.settings.openaicompat_ttsVoice}
            onChange={(evt) =>
              store.updateSettings({ openaicompat_ttsVoice: evt.target.value })
            }
          />
        </div>
      </div>
    </>
  );
});
