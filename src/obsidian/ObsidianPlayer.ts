import { App, normalizePath } from "obsidian";
import { AudioCache, hashAudioInputs } from "src/player/AudioCache";
import { TTSModelOptions } from "src/player/TTSModel";

export function obsidianStorage(app: App): AudioCache {
  const vault = app.vault;
  const cachedir = ".tts";

  return {
    async getAudio(
      text: string,
      settings: TTSModelOptions,
    ): Promise<ArrayBuffer | null> {
      const str = hashAudioInputs(text, settings);
      const filepath = normalizePath(`/${cachedir}/${str}.mp3`);
      const exists = await vault.adapter.exists(filepath);
      if (!exists) {
        return null;
      } else {
        const data = await vault.adapter.readBinary(filepath);
        return data;
      }
    },
    async saveAudio(
      text: string,
      settings: TTSModelOptions,
      audio: ArrayBuffer,
    ): Promise<void> {
      const str = hashAudioInputs(text, settings);
      const filepath = normalizePath(`/${cachedir}/${str}.mp3`);

      const exists = await vault.adapter.exists(normalizePath(`/${cachedir}`));
      if (!exists) {
        await vault.adapter.mkdir(normalizePath(`/${cachedir}`));
      }
      await vault.adapter.writeBinary(filepath, audio);
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
