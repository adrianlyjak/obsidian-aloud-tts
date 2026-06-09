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

const LOCAL_SERVERS = [
  {
    name: "Chatterbox",
    description: "Free, local voice cloning. Best quality for custom voices.",
    url: "https://github.com/resemble-ai/chatterbox",
    config: {
      apiBase: "http://localhost:4123",
      model: "chatterbox",
      format: "mp3",
    },
  },
  {
    name: "Kokoro (via kokoro-fastapi)",
    description: "Lightweight, fast, multiple voices. Good for general use.",
    url: "https://github.com/remsky/kokoro-fastapi",
    config: {
      apiBase: "http://localhost:8880",
      model: "kokoro",
      format: "mp3",
    },
  },
  {
    name: "Ollama (speech model)",
    description: "Run any Ollama-compatible speech model locally.",
    url: "https://ollama.com",
    config: {
      apiBase: "http://localhost:11434",
      model: "your-model-name",
      format: "mp3",
    },
  },
] as const;

const LocalServerGuide: React.FC<{ store: TTSPluginSettingsStore }> = observer(
  ({ store }) => {
    const [open, setOpen] = React.useState(false);

    function applyConfig(config: (typeof LOCAL_SERVERS)[number]["config"]) {
      store.updateModelSpecificSettings("openaicompat", {
        openaicompat_apiBase: config.apiBase,
        openaicompat_ttsModel: config.model,
        openaicompat_responseFormat: config.format,
        openaicompat_apiKey: "",
      });
    }

    return (
      <div
        className="setting-item"
        style={{
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "0.5em",
        }}
      >
        <div className="setting-item-info" style={{ width: "100%" }}>
          <div className="setting-item-name">
            <button
              className="clickable-icon"
              onClick={() => setOpen((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.3em",
                fontSize: "inherit",
                fontWeight: "inherit",
                color: "inherit",
              }}
            >
              <span>{open ? "▾" : "▸"}</span>
              <span>Run a local TTS server</span>
            </button>
          </div>
          <div className="setting-item-description">
            Free alternatives you can self-host and connect here.
          </div>
        </div>
        {open && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "0.75em",
              paddingLeft: "1em",
            }}
          >
            {LOCAL_SERVERS.map((server) => (
              <div
                key={server.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1em",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    <a
                      href={server.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {server.name}
                    </a>
                  </div>
                  <div
                    className="setting-item-description"
                    style={{ marginTop: "0.1em" }}
                  >
                    {server.description}
                  </div>
                  <code style={{ fontSize: "0.8em" }}>
                    {server.config.apiBase}
                  </code>
                </div>
                <button
                  className="mod-cta"
                  style={{ flexShrink: 0 }}
                  onClick={() => applyConfig(server.config)}
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

export const OpenAICompatibleSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <LocalServerGuide store={store} />
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
