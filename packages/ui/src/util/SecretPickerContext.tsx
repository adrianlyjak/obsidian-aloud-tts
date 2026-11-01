import * as React from "react";

/**
 * Mounts a host-provided secret picker (e.g. Obsidian's SecretComponent) into
 * `container`, showing `value` and calling `onChange` with the chosen secret's
 * name. Returns a cleanup function.
 */
export type SecretPickerRenderer = (
  container: HTMLElement,
  value: string,
  onChange: (name: string | null) => void,
) => () => void;

/** Provided by hosts with a secret store; without it, keys are typed in directly */
export const SecretPickerContext =
  React.createContext<SecretPickerRenderer | null>(null);
