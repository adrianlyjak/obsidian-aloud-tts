import { App, normalizePath } from "obsidian";
import { AudioCache, hashAudioInputs } from "../player/AudioCache";
import { TTSModelOptions } from "../models/tts-model";
import { TTSPluginSettingsStore } from "../player/TTSPluginSettings";
import { AudioData, MediaFormat } from "../models/tts-model";
import { IndexedDBAudioStorage } from "../web/IndexedDBAudioStorage";
import * as mobx from "mobx";

export function configurableAudioCache(
  app: App,
  settings: TTSPluginSettingsStore,
): AudioCache & { destroy(): void } {
  const createCache = (): AudioCache =>
    settings.settings.cacheType === "vault"
      ? obsidianFileVault(app)
      : new IndexedDBAudioStorage();

  let active: AudioCache = createCache();

  const cancelReaction = mobx.reaction(
    () => settings.settings.cacheType,
    () => {
      active = createCache();
    },
  );

  return {
    async getAudio(
      text: string,
      settings: TTSModelOptions,
      format: MediaFormat,
    ): Promise<AudioData | null> {
      return active.getAudio(text, settings, format);
    },
    async saveAudio(
      text: string,
      settings: TTSModelOptions,
      audio: AudioData,
    ): Promise<void> {
      return active.saveAudio(text, settings, audio);
    },
    async expire(ageInMillis = 1000 * 60 * 60 * 8): Promise<void> {
      return active.expire(ageInMillis);
    },
    async getStorageSize(): Promise<number> {
      return active.getStorageSize();
    },

    destroy() {
      cancelReaction();
    },
  };
}

export function obsidianFileVault(app: App): AudioCache {
  const vault = app.vault;
  const cachedir = ".tts";
  // Default format reserved for future use when upgrading existing entries

  return {
    async getAudio(
      text: string,
      settings: TTSModelOptions,
      format: MediaFormat,
    ): Promise<AudioData | null> {
      const str = hashAudioInputs(text, settings, format);
      const filepath = normalizePath(`/${cachedir}/${str}.${format}`);
      const exists = await vault.adapter.exists(filepath);
      if (!exists) {
        return null;
      } else {
        const data = await vault.adapter.readBinary(filepath);
        return { data, format };
      }
    },
    async saveAudio(
      text: string,
      settings: TTSModelOptions,
      audio: AudioData,
    ): Promise<void> {
      const str = hashAudioInputs(text, settings, audio.format);
      const filepath = normalizePath(`/${cachedir}/${str}.${audio.format}`);

      const exists = await vault.adapter.exists(normalizePath(`/${cachedir}`));
      if (!exists) {
        await vault.adapter.mkdir(normalizePath(`/${cachedir}`));
      }
      await vault.adapter.writeBinary(filepath, audio.data);
    },
    async expire(ageInMillis = 1000 * 60 * 60 * 8): Promise<void> {
      const exists = await vault.adapter.exists(normalizePath(`/${cachedir}`));
      if (!exists) {
        return;
      }
      const listed = await vault.adapter.list(".tts");
      for (const file of listed.files) {
        const stats = await vault.adapter.stat(file);
        if (stats) {
          const tooOld = stats.mtime + ageInMillis < Date.now().valueOf();
          if (tooOld) {
            await vault.adapter.remove(file);
          }
        }
      }
    },

    async getStorageSize(): Promise<number> {
      const listed = await vault.adapter.list(".tts");
      let total = 0;
      for (const file of listed.files) {
        const stats = await vault.adapter.stat(file);
        if (stats) {
          total += stats.size;
        }
      }
      return total;
    },
  };
}
