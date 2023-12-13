import { App } from "obsidian";
import { hashString } from "../util/Minhash";
import { AudioCache } from "../player/Player";
import { TTSPluginSettings } from "../player/TTSPluginSettings";

export function obsidianStorage(app: App): AudioCache {
  const vault = app.vault;
  const cachedir = ".tts";

  function toKey(text: string, settings: TTSPluginSettings): string {
    return "" + hashString([settings.model, settings.ttsVoice, text].join("/"));
  }

  return {
    async getAudio(
      text: string,
      settings: TTSPluginSettings
    ): Promise<ArrayBuffer | null> {
      const str = toKey(text, settings);
      const filepath = `/${cachedir}/${str}.mp3`;
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
      settings: TTSPluginSettings,
      audio: ArrayBuffer
    ): Promise<void> {
      const str = toKey(text, settings);
      const filepath = `/${cachedir}/${str}.mp3`;

      const exists = await vault.adapter.exists(`/${cachedir}`);
      if (!exists) {
        await vault.adapter.mkdir(`/${cachedir}`);
      }
      await vault.adapter.writeBinary(filepath, audio);
    },
    async expire(): Promise<void> {
      const listed = await vault.adapter.list(".tts");
      for (const file of listed.files) {
        const stats = await vault.adapter.stat(file);
        if (stats) {
          const expiration = 60 * 60 * 24 * 30; // 30 days in seconds
          const tooOld = stats.mtime + expiration < Date.now().valueOf() / 1000;
          if (tooOld) {
            await vault.adapter.remove(file);
          }
        }
      }
    },
  };
}
