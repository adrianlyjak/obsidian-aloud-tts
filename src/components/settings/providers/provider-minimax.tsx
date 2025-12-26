import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, TextInputSetting } from "../setting-components";
import { MINIMAX_VOICES } from "./provider-minimax-voices";

export const MinimaxSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="minimax"
          fieldName="minimax_apiKey"
          displayName="MiniMax API key"
          helpUrl="https://platform.minimax.io/user-center/basic-information/interface-key"
          showValidation={true}
        />
        <TextInputSetting
          name="GroupId"
          description="Your MiniMax GroupId. Append to API URL as query parameter."
          store={store}
          provider="minimax"
          fieldName="minimax_groupId"
          placeholder="e.g. 1234567890"
        />
        <MinimaxModelComponent store={store} />
        <MinimaxVoiceComponent store={store} />
      </>
    );
  },
);

const MINIMAX_MODELS = [
  { label: "speech-2.6-hd", value: "speech-2.6-hd" },
  { label: "speech-2.6-turbo", value: "speech-2.6-turbo" },
  { label: "speech-02-hd", value: "speech-02-hd" },
  { label: "speech-02-turbo", value: "speech-02-turbo" },
  { label: "speech-01-hd", value: "speech-01-hd" },
  { label: "speech-01-turbo", value: "speech-01-turbo" },
] as const;

const MinimaxModelComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    return (
      <OptionSelectSetting
        name="Model"
        description="The MiniMax TTS model to use"
        store={store}
        provider="minimax"
        fieldName="minimax_ttsModel"
        options={MINIMAX_MODELS}
      />
    );
  });

const MinimaxVoiceComponent: React.FC<{ store: TTSPluginSettingsStore }> =
  observer(({ store }) => {
    return (
      <OptionSelectSetting
        name="Voice"
        description="The MiniMax voice to use"
        store={store}
        provider="minimax"
        fieldName="minimax_ttsVoice"
        options={MINIMAX_VOICES}
      />
    );
  });
