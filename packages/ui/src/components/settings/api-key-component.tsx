import { observer } from "mobx-react-lite";
import React from "react";
import { ModelProvider, SecretField, TTSPluginSettingsStore } from "open-tts";
import { SecretPickerContext } from "../../util/SecretPickerContext";
import { IconButton, TooltipSpan, Spinner } from "../IconButton";
import { Check, AlertCircle } from "lucide-react";

export interface ApiKeyComponentProps {
  store: TTSPluginSettingsStore;
  provider: ModelProvider;
  fieldName: SecretField;
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
    const renderSecretPicker = React.useContext(SecretPickerContext);
    const useSecretPicker = store.usesSecretStore && !!renderSecretPicker;
    const missing = store.missingSecrets.find(
      (secret) => secret.field === fieldName,
    );

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
        `Your ${displayName}.`
      ));

    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{displayName}</div>
          <div className="setting-item-description">
            {description}
            {useSecretPicker && !missing && (
              <> Kept in Obsidian&apos;s keychain on this device.</>
            )}
          </div>
          {missing && (
            <div className="setting-item-description tts-secret-missing">
              The secret &quot;{missing.name}&quot; isn&apos;t on this device.
              Keychain secrets aren&apos;t synced, so add it here once.
            </div>
          )}
        </div>
        <div className="setting-item-control">
          {validIcon &&
            (validIcon === "loader" ? (
              <Spinner />
            ) : (
              <TooltipSpan
                tooltip={
                  validIcon === "alert-circle" ? errorMessage : undefined
                }
              >
                {validIcon === "check" ? (
                  <Check size={16} />
                ) : validIcon === "alert-circle" ? (
                  <AlertCircle size={16} />
                ) : null}
              </TooltipSpan>
            ))}
          {useSecretPicker && renderSecretPicker ? (
            <SecretPicker
              render={renderSecretPicker}
              value={store.settings.secretNames[fieldName] ?? ""}
              onChange={(name) =>
                void store.setSecretName(provider, fieldName, name)
              }
            />
          ) : (
            <>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="API Key"
                aria-label={displayName}
                value={store.settings[fieldName]}
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
            </>
          )}
        </div>
      </div>
    );
  },
);

const SecretPicker: React.FC<{
  render: NonNullable<React.ContextType<typeof SecretPickerContext>>;
  value: string;
  onChange: (name: string | null) => void;
}> = ({ render, value, onChange }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    if (!ref.current) {
      return;
    }
    return render(ref.current, value, (name) => onChangeRef.current(name));
  }, [render, value]);
  return <div className="tts-secret-picker" ref={ref} />;
};
