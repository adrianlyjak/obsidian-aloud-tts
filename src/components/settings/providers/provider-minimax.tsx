import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import {
  CheckboxSetting,
  OptionSelectSetting,
  TextInputSetting,
} from "../setting-components";
import { MINIMAX_VOICES } from "./provider-minimax-voices";

export const MinimaxSettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    const useChinaEndpoint = store.settings.minimax_useChinaEndpoint;
    const helpUrl = useChinaEndpoint
      ? "https://platform.minimaxi.com/user-center/basic-information/interface-key"
      : "https://platform.minimax.io/user-center/basic-information/interface-key";

    return (
      <>
        <CheckboxSetting
          name="Use China Mainland Endpoint"
          description={
            <>
              Enable this if you have an API key from the China mainland
              platform (
              <a
                href="https://platform.minimaxi.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                platform.minimaxi.com
              </a>
              ). Leave disabled for the international platform (
              <a
                href="https://platform.minimax.io"
                target="_blank"
                rel="noopener noreferrer"
              >
                platform.minimax.io
              </a>
              ). API keys from one platform are not compatible with the other.
            </>
          }
          store={store}
          provider="minimax"
          fieldName="minimax_useChinaEndpoint"
        />
        <ApiKeyComponent
          store={store}
          provider="minimax"
          fieldName="minimax_apiKey"
          displayName="MiniMax API key"
          helpUrl={helpUrl}
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
