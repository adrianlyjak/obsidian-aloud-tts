import React from "react";
import { observer } from "mobx-react-lite";
import {
  ModelProvider,
  TTSPluginSettingsStore,
} from "../../player/TTSPluginSettings";
import { OptionSelect } from "./option-select";

// Common props for all setting components
interface BaseSettingProps {
  name: string;
  description: string;
}

// Option select setting component for dropdowns
export interface OptionSelectSettingProps extends BaseSettingProps {
  store: TTSPluginSettingsStore;
  provider: ModelProvider;
  fieldName: keyof TTSPluginSettingsStore["settings"];
  options: readonly { label: string; value: string }[];
}

export const OptionSelectSetting: React.FC<OptionSelectSettingProps> = observer(
  ({ name, description, store, provider, fieldName, options }) => {
    const onChange = React.useCallback(
      (value: string) => {
        store.updateModelSpecificSettings(provider, {
          [fieldName]: value,
        });
      },
      [store, provider, fieldName],
    );

    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{name}</div>
          <div className="setting-item-description">{description}</div>
        </div>
        <div className="setting-item-control">
          <OptionSelect
            options={options}
            value={store.settings[fieldName] as string}
            onChange={onChange}
          />
        </div>
      </div>
    );
  },
);

// Text input setting with optional validation
export interface TextInputSettingProps extends BaseSettingProps {
  store: TTSPluginSettingsStore;
  provider?: ModelProvider;
  fieldName: keyof TTSPluginSettingsStore["settings"];
  placeholder?: string;
  validation?: {
    validate: (value: string) => boolean;
    errorMessage: string;
  };
}

export const TextInputSetting: React.FC<TextInputSettingProps> = observer(
  ({
    name,
    description,
    store,
    provider,
    fieldName,
    placeholder,
    validation,
  }) => {
    const currentValue = store.settings[fieldName] as string;
    const [state, setState] = React.useState({
      raw: currentValue,
      valid: !validation || validation.validate(currentValue),
    });

    React.useEffect(() => {
      if (currentValue !== state.raw) {
        setState({
          raw: currentValue,
          valid: !validation || validation.validate(currentValue),
        });
      }
    }, [currentValue, validation]);

    const onChange: React.ChangeEventHandler<HTMLInputElement> =
      React.useCallback(
        (evt) => {
          const value = evt.target.value;
          const valid = !validation || validation.validate(value);
          setState({ raw: value, valid });

          if (valid || !value) {
            if (provider) {
              store.updateModelSpecificSettings(provider, {
                [fieldName]: value,
              });
            } else {
              store.updateSettings({ [fieldName]: value });
            }
          }
        },
        [store, provider, fieldName, validation],
      );

    return (
      <>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{name}</div>
            <div className="setting-item-description">{description}</div>
          </div>
          <div className="setting-item-control">
            <input
              type="text"
              placeholder={placeholder}
              value={state.raw}
              onChange={onChange}
              className={!state.valid ? "tts-error-input" : ""}
            />
          </div>
        </div>
        {!state.valid && state.raw && validation && (
          <div
            className="setting-item-description tts-error-text"
            style={{ marginBottom: "0.5rem" }}
          >
            {validation.errorMessage}
          </div>
        )}
      </>
    );
  },
);

// Textarea setting for instructions
export interface TextareaSettingProps extends BaseSettingProps {
  store: TTSPluginSettingsStore;
  provider: ModelProvider;
  fieldName: keyof TTSPluginSettingsStore["settings"];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export const TextareaSetting: React.FC<TextareaSettingProps> = observer(
  ({
    name,
    description,
    store,
    provider,
    fieldName,
    placeholder,
    rows = 3,
    disabled = false,
  }) => {
    const onChange: React.ChangeEventHandler<HTMLTextAreaElement> =
      React.useCallback(
        (evt) => {
          store.updateModelSpecificSettings(provider, {
            [fieldName]: evt.target.value,
          });
        },
        [store, provider, fieldName],
      );

    const value = disabled ? "" : (store.settings[fieldName] as string);

    return (
      <div className="setting-item tts-settings-block">
        <div className="setting-item-info">
          <div className="setting-item-name">{name}</div>
          <div className="setting-item-description">{description}</div>
        </div>
        <textarea
          value={value}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          className="tts-instructions-textarea"
        />
      </div>
    );
  },
);

// Checkbox setting for boolean values
export interface CheckboxSettingProps extends BaseSettingProps {
  store: TTSPluginSettingsStore;
  provider: ModelProvider;
  fieldName: keyof TTSPluginSettingsStore["settings"];
}

export const CheckboxSetting: React.FC<CheckboxSettingProps> = observer(
  ({ name, description, store, provider, fieldName }) => {
    const onChange: React.ChangeEventHandler<HTMLInputElement> =
      React.useCallback(
        (evt) => {
          store.updateModelSpecificSettings(provider, {
            [fieldName]: evt.target.checked,
          });
        },
        [store, provider, fieldName],
      );

    return (
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{name}</div>
          <div className="setting-item-description">{description}</div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={store.settings[fieldName] as boolean}
            onChange={onChange}
          />
        </div>
      </div>
    );
  },
);
