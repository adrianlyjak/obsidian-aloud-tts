import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore, listKokoroVoices } from "open-tts";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";

export const KokoroSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <TextInputSetting
          name="Server URL"
          description="The address of your Kokoro-FastAPI server, e.g. http://localhost:8880."
          store={store}
          provider="kokoro"
          fieldName="kokoro_apiBase"
          placeholder="http://localhost:8880"
          validation={{
            validate: (value: string) => /^https?:\/\/.+/.test(value),
            errorMessage: "Enter a URL starting with http:// or https://.",
          }}
        />
        <KokoroVoiceComponent store={store} />
      </>
    );
  },
);

const KokoroVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const [voices, setVoices] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const apiBase = store.settings.kokoro_apiBase;

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    listKokoroVoices(apiBase)
      .then((fetched) => {
        if (!cancelled) setVoices(fetched);
      })
      .catch((err) => {
        console.error("Failed to fetch Kokoro voices:", err);
        if (!cancelled) {
          setVoices([]);
          setError("Failed to load voices. Please check the server URL.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  if (error) {
    return <p style={{ color: "var(--text-error)" }}>{error}</p>;
  }

  const current = store.settings.kokoro_voice;
  const options = (
    voices.includes(current) || !current ? voices : [current, ...voices]
  ).map((voice) => ({ label: voice, value: voice }));

  return (
    <OptionSelectSetting
      name="Voice"
      description="The Kokoro voice to use. The prefix shows the language and gender, e.g. af = American female, bm = British male."
      store={store}
      provider="kokoro"
      fieldName="kokoro_voice"
      options={options}
    />
  );
});
