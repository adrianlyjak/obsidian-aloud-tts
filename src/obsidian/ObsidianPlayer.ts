import { App, normalizePath } from "obsidian";
import { hashString } from "../util/Minhash";
import { AudioCache } from "../player/Player";
import { TTSPluginSettings } from "../player/TTSPluginSettings";

export function obsidianStorage(app: App): AudioCache {
  const vault = app.vault;
  const cachedir = ".tts";

  function toKey(text: string, settings: TTSPluginSettings): string {
    return (
      "" +
      hashString(
        [
          settings.model,
          settings.ttsVoice,
          `${settings.playbackSpeed}`,
          text,
        ].join("/"),
      )
    );
  }

  return {
    async getAudio(
      text: string,
      settings: TTSPluginSettings,
    ): Promise<ArrayBuffer | null> {
      const str = toKey(text, settings);
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
      settings: TTSPluginSettings,
      audio: ArrayBuffer,
    ): Promise<void> {
      const str = toKey(text, settings);
      const filepath = normalizePath(`/${cachedir}/${str}.mp3`);

      const exists = await vault.adapter.exists(normalizePath(`/${cachedir}`));
      if (!exists) {
        await vault.adapter.mkdir(normalizePath(`/${cachedir}`));
      }
      await vault.adapter.writeBinary(filepath, audio);
    },
    async expire(ageInMillis = 1000 * 60 * 60 * 8): Promise<void> {
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
  };
}
