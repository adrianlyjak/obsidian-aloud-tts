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
        Object.assign(this.settings, parsePollyAuthSettingsUpdate(update));
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
        Object.assign(this.settings, parsePollyAuthSettingsUpdate(update));
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
    polly_profile: normalizedProfile(partial.polly_profile),
    polly_refreshCommand: normalizedRefreshCommand(
      partial.polly_refreshCommand,
    ),
  };
}

function parsePollyAuthSettingsUpdate(
  update: Partial<PollyAuthSettings>,
): Partial<PollyAuthSettings> {
  const next: Partial<PollyAuthSettings> = {};
  if (update.polly_authMode !== undefined) {
    next.polly_authMode =
      update.polly_authMode === "profile" ? "profile" : "static";
  }
  if (update.polly_profile !== undefined) {
    next.polly_profile = normalizedProfile(update.polly_profile);
  }
  if (update.polly_refreshCommand !== undefined) {
    next.polly_refreshCommand = normalizedRefreshCommand(
      update.polly_refreshCommand,
    );
  }
  return next;
}

function normalizedProfile(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "default";
}

function normalizedRefreshCommand(value: unknown): string {
  return typeof value === "string" ? value : "";
}
