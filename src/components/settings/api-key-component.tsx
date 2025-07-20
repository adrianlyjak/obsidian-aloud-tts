import { observer } from "mobx-react-lite";
import React from "react";
import {
  ModelProvider,
  TTSPluginSettingsStore,
} from "../../player/TTSPluginSettings";
import { IconButton, IconSpan, Spinner } from "../IconButton";

export interface ApiKeyComponentProps {
  store: TTSPluginSettingsStore;
  provider: ModelProvider;
  fieldName: keyof TTSPluginSettingsStore["settings"];
  displayName: string;
  helpUrl?: string;
  helpText?: React.ReactNode;
  showValidation?: boolean;
}

export const ApiKeyComponent: React.FC<ApiKeyComponentProps> = observer(
  ({
    store,
    provider,
    fieldName,
    displayName,
    helpUrl,
    helpText,
    showValidation = false,
  }) => {
    const [showPassword, setShowPassword] = React.useState(false);

    let validIcon: string | null = null;
    if (showValidation) {
      switch (store.apiKeyValid) {
        case true:
          validIcon = "check";
          break;
        case false:
          validIcon = "alert-circle";
          break;
        default:
          validIcon = "loader";
          break;
      }
    }
    const errorMessage = store.apiKeyError;

    const onChange: React.ChangeEventHandler<HTMLInputElement> =
      React.useCallback(
        (v: React.ChangeEvent<HTMLInputElement>) => {
          store.updateModelSpecificSettings(provider, {
            [fieldName]: v.target.value,
          });
        },
        [provider, fieldName, store],
      );

    const description =
      helpText ||
      (helpUrl ? (
        <>
          Your {displayName}. You can create one{" "}
          <a href={helpUrl} target="_blank">
            here
          </a>
          .
        </>
      ) : (
        `Your ${displayName}`
      ));

    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{displayName}</div>
          <div className="setting-item-description">{description}</div>
        </div>
        <div className="setting-item-control">
          {validIcon &&
            (validIcon === "loader" ? (
              <Spinner />
            ) : (
              <IconSpan
                icon={validIcon}
                tooltip={
                  validIcon === "alert-circle" ? errorMessage : undefined
                }
              />
            ))}
          <input
            type={showPassword ? "text" : "password"}
            placeholder="API Key"
            value={store.settings[fieldName] as string}
            onChange={onChange}
            className={
              showValidation && validIcon === "alert-circle"
                ? "tts-error-input"
                : ""
            }
          />
          <IconButton
            icon={showPassword ? "eye-off" : "eye"}
            onClick={() => setShowPassword(!showPassword)}
          />
        </div>
      </div>
    );
  },
);
