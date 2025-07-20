import React from "react";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { observer } from "mobx-react-lite";
import { ApiKeyComponent } from "./api-key-component";
import { OptionSelect } from "./option-select";

export function HumeSettings({ store }: { store: TTSPluginSettingsStore }) {
    return <>
          <h1>Hume</h1>
          <HumeApiKeyComponent store={store} />
          <HumeProviderComponent store={store} />
          <HumeVoiceComponent store={store} />
          <HumeTTSInstructionsComponent store={store} />
          <HumeContextModeComponent store={store} />
        </>
}

const HumeApiKeyComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <ApiKeyComponent
      store={store}
      provider="hume"
      fieldName="hume_apiKey"
      displayName="Hume API key"
      helpText={
        <>
          Your Hume API key. You can get one{" "}
          <a href="https://platform.hume.ai/settings/keys" target="_blank">
            here
          </a>
          .
        </>
      }
      showValidation={true}
    />
  );
});

const HumeProviderComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    const providerOptions = [
      { label: "Hume", value: "HUME_AI" },
      { label: "Custom Voice", value: "CUSTOM_VOICE" },
    ];
    const onChange = React.useCallback(
      (v: string) => {
        store.updateModelSpecificSettings("hume", {
          hume_sourceType: v,
        });
      },
      [store],
    );
    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Provider</div>
          <div className="setting-item-description">
            Choose between Hume's preset voices or your own custom voices.
          </div>
        </div>
        <div className="setting-item-control">
          <OptionSelect
            options={providerOptions}
            value={store.settings.hume_sourceType}
            onChange={onChange}
          />
        </div>
      </div>
    );
  });

const HumeVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  function isValidUUID(uuid: string) {
    if (!uuid) {
      return true; // Allow empty string
    }
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  const [state, setState] = React.useState({
    raw: store.settings.hume_ttsVoice ?? "",
    valid: isValidUUID(store.settings.hume_ttsVoice ?? ""),
  });

  React.useEffect(() => {
    const currentValue = store.settings.hume_ttsVoice ?? "";
    if (currentValue !== state.raw) {
      setState({
        raw: currentValue,
        valid: isValidUUID(currentValue),
      });
    }
  }, [store.settings.hume_ttsVoice]);

  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (v: React.ChangeEvent<HTMLInputElement>) => {
        const value = v.target.value;
        const valid = isValidUUID(value);
        setState({
          raw: value,
          valid,
        });
        if (valid || !value) {
          store.updateModelSpecificSettings("hume", {
            hume_ttsVoice: value,
          });
        }
      },
      [store],
    );

  return (
    <>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Hume Voice ID</div>
          <div className="setting-item-description">
            The Hume Voice ID to use{" "}
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={state.raw}
            onChange={onChange}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            className={!state.valid ? "tts-error-input" : ""}
          />
        </div>
      </div>
      {!state.valid && state.raw && (
        <div
          className="setting-item-description tts-error-text"
          style={{ marginBottom: "0.5rem" }}
        >
          Please enter a valid UUID format
        </div>
      )}
    </>
  );
});

const HumeTTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
    React.useCallback((evt) => {
      store.updateModelSpecificSettings("hume", {
        hume_ttsInstructions: evt.target.value,
      });
    }, []);

  const disabled = false;
  const instructions = store.settings.hume_ttsInstructions;

  return (
    <div className="setting-item tts-settings-block">
      <div className="setting-item-info">
        <div className="setting-item-name">Voice Instructions</div>
        <div className="setting-item-description">
          Optional instructions to customize the tone and style of the voice
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

const HumeContextModeComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const onChange: React.ChangeEventHandler<HTMLInputElement> =
    React.useCallback(
      (evt) => {
        store.updateModelSpecificSettings("hume", {
          hume_contextMode: evt.target.checked,
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
          checked={store.settings.hume_contextMode}
          onChange={onChange}
        />
      </div>
    </div>
  );
});