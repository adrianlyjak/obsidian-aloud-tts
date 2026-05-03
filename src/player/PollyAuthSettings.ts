import { action, observable } from "mobx";
import { openDB, DBSchema, IDBPDatabase } from "idb";

export type PollyAuthMode = "static" | "profile";

export interface PollyAuthSettings {
  polly_authMode: PollyAuthMode;
  polly_profile: string;
  polly_refreshCommand: string;
}

export const DEFAULT_POLLY_AUTH_SETTINGS: PollyAuthSettings = {
  polly_authMode: "static",
  polly_profile: "default",
  polly_refreshCommand: "",
};

export interface PollyAuthSettingsStore {
  settings: PollyAuthSettings;
  updateSettings(settings: Partial<PollyAuthSettings>): Promise<void>;
}

export function memoryPollyAuthSettingsStore(
  initial: Partial<PollyAuthSettings> = {},
): PollyAuthSettingsStore {
  const store = observable(
    {
      settings: parsePollyAuthSettings(initial),
      async updateSettings(update: Partial<PollyAuthSettings>): Promise<void> {
        Object.assign(this.settings, parsePollyAuthSettings(update));
      },
    },
    {
      settings: observable,
      updateSettings: action,
    },
  );
  return store;
}

interface PollyAuthSettingsDB extends DBSchema {
  settings: {
    key: string;
    value: PollyAuthSettings;
  };
}

export async function indexedDBPollyAuthSettingsStore(
  dbName: string = "tts-aloud-device-settings",
): Promise<PollyAuthSettingsStore> {
  if (typeof indexedDB === "undefined") {
    return memoryPollyAuthSettingsStore();
  }
  const db = await openDB<PollyAuthSettingsDB>(dbName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings");
      }
    },
  });
  const loaded = await db.get("settings", "polly-auth");
  return persistedPollyAuthSettingsStore(db, loaded);
}

function persistedPollyAuthSettingsStore(
  db: IDBPDatabase<PollyAuthSettingsDB>,
  initial: Partial<PollyAuthSettings> | undefined,
): PollyAuthSettingsStore {
  const store = observable(
    {
      settings: parsePollyAuthSettings(initial),
      async updateSettings(update: Partial<PollyAuthSettings>): Promise<void> {
        Object.assign(this.settings, parsePollyAuthSettings(update));
        await db.put("settings", { ...this.settings }, "polly-auth");
      },
    },
    {
      settings: observable,
      updateSettings: action,
    },
  );
  return store;
}

export function parsePollyAuthSettings(value: unknown): PollyAuthSettings {
  const data = typeof value === "object" && value ? value : {};
  const partial = data as Partial<PollyAuthSettings>;
  const authMode = partial.polly_authMode === "profile" ? "profile" : "static";
  return {
    polly_authMode: authMode,
    polly_profile: partial.polly_profile?.trim() || "default",
    polly_refreshCommand: partial.polly_refreshCommand || "",
  };
}
