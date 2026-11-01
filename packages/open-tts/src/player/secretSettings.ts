import type { TTSPluginSettings } from "./TTSPluginSettings";

/** Where secrets are kept, e.g. Obsidian's SecretStorage (per device, not synced) */
export interface SecretStore {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
  listSecrets(): string[];
}

/** Settings fields that hold credentials */
export const SECRET_FIELDS = [
  "openai_apiKey",
  "openaicompat_apiKey",
  "gemini_apiKey",
  "hume_apiKey",
  "elevenlabs_apiKey",
  "azure_apiKey",
  "minimax_apiKey",
  "fish_apiKey",
  "inworld_apiKey",
  "polly_accessKeyId",
  "polly_secretAccessKey",
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

/** The secret name a field's key is migrated to, e.g. "aloud-openai-api-key" */
export function defaultSecretName(field: SecretField): string {
  return (
    "aloud-" +
    field
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/_/g, "-")
      .toLowerCase()
  );
}

/** `base`, or `base-2`, `base-3`, ... if taken, so an existing secret is never overwritten */
function unusedSecretName(base: string, secrets: SecretStore): string {
  const taken = new Set(secrets.listSecrets());
  let name = base;
  for (let suffix = 2; taken.has(name); suffix++) {
    name = `${base}-${suffix}`;
  }
  return name;
}

/**
 * Moves plaintext keys into the secret store. Each migrated field records the
 * secret's name in `secretNames`; its value stays in memory for this session.
 */
export function migrateToSecrets(
  settings: TTSPluginSettings,
  secrets: SecretStore,
): { settings: TTSPluginSettings; migrated: SecretField[] } {
  const secretNames = { ...settings.secretNames };
  const migrated: SecretField[] = [];
  for (const field of SECRET_FIELDS) {
    const value = settings[field].trim();
    if (!value || secretNames[field]) {
      continue;
    }
    // Reuse a secret that already holds this key (e.g. one shared with another plugin)
    const existing = secrets
      .listSecrets()
      .find((name) => secrets.getSecret(name) === value);
    const name =
      existing ?? unusedSecretName(defaultSecretName(field), secrets);
    if (!existing) {
      secrets.setSecret(name, value);
    }
    secretNames[field] = name;
    migrated.push(field);
  }
  return { settings: { ...settings, secretNames }, migrated };
}

export interface MissingSecret {
  field: SecretField;
  name: string;
}

/**
 * Fills each field that names a secret with that secret's value. Secrets live
 * per device, so a name synced from another device may be missing here.
 */
export function resolveSecrets(
  settings: TTSPluginSettings,
  secrets: SecretStore,
): { settings: TTSPluginSettings; missing: MissingSecret[] } {
  const resolved = { ...settings };
  const missing: MissingSecret[] = [];
  for (const field of SECRET_FIELDS) {
    const name = settings.secretNames[field];
    if (!name) {
      continue;
    }
    const value = secrets.getSecret(name);
    if (value === null) {
      resolved[field] = "";
      missing.push({ field, name });
    } else {
      resolved[field] = value;
    }
  }
  return { settings: resolved, missing };
}

/** The settings as they should be saved: credentials with a secret name are blanked */
export function withoutSecretValues(
  settings: TTSPluginSettings,
): TTSPluginSettings {
  const saved = { ...settings };
  for (const field of SECRET_FIELDS) {
    if (settings.secretNames[field]) {
      saved[field] = "";
    }
  }
  return saved;
}

/** The missing secrets that `provider` needs (its fields are named `<provider>_...`) */
export function missingSecretsFor(
  provider: string,
  missing: MissingSecret[],
): MissingSecret[] {
  return missing.filter((secret) => secret.field.startsWith(`${provider}_`));
}
