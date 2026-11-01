import * as obsidian from "obsidian";
import { App } from "obsidian";
import { SecretStore } from "open-tts";
import { SecretPickerRenderer } from "@open-tts/ui";

// SecretStorage and SecretComponent arrived in Obsidian 1.11.4, after the API
// version this plugin builds against, so both are detected at runtime.

interface SecretComponentLike {
  setValue(value: string): SecretComponentLike;
  onChange(callback: (value: string | null) => unknown): SecretComponentLike;
}

type SecretComponentConstructor = new (
  app: App,
  containerEl: HTMLElement,
) => SecretComponentLike;

function secretComponentClass(): SecretComponentConstructor | undefined {
  return (
    obsidian as unknown as { SecretComponent?: SecretComponentConstructor }
  ).SecretComponent;
}

/** Obsidian's keychain, when this version of Obsidian has one */
export function obsidianSecretStore(app: App): SecretStore | undefined {
  const storage = (app as unknown as { secretStorage?: SecretStore })
    .secretStorage;
  return storage && secretComponentClass() ? storage : undefined;
}

/** Renders Obsidian's own secret picker, when this version of Obsidian has one */
export function obsidianSecretPicker(app: App): SecretPickerRenderer | null {
  const SecretComponent = secretComponentClass();
  if (!SecretComponent || !obsidianSecretStore(app)) {
    return null;
  }
  return (container, value, onChange) => {
    new SecretComponent(app, container).setValue(value).onChange(onChange);
    return () => container.replaceChildren();
  };
}
