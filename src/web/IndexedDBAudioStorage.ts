import { openDB, DBSchema, IDBPDatabase } from "idb";
import { AudioCache, hashAudioInputs } from "../player/AudioCache";
import { AudioData, MediaFormat, TTSModelOptions } from "../models/tts-model";

interface AudioCacheDB extends DBSchema {
  audio: {
    value: {
      hash: string;
      blob: Blob;
      format: MediaFormat;
    };
    key: string;
  };
  audioMetadata: {
    value: {
      hash: string;
      size: number;
      lastread: number;
      format: MediaFormat;
    };
    key: string;
    indexes: { lastread: number };
  };
}

export class IndexedDBAudioStorage implements AudioCache {
  private dbRequest: Promise<IDBPDatabase<AudioCacheDB>>;

  private _db: IDBPDatabase<AudioCacheDB> | undefined;

  ready(): Promise<void> {
    return this.dbRequest.then(() => {});
  }

  get db(): IDBPDatabase<AudioCacheDB> {
    if (!this._db) {
      throw new Error("Not ready");
    }
    return this._db;
  }

  constructor() {
    this.dbRequest = openDB<AudioCacheDB>("tts-aloud-db", 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", {
            keyPath: "hash",
          });
        }
        if (!db.objectStoreNames.contains("audioMetadata")) {
          const audio = db.createObjectStore("audioMetadata", {
            keyPath: "hash",
          });
          audio.createIndex("lastread", "lastread");
        }
        // v3 adds format fields; data migration best-effort
        // Existing entries will simply lack the format; we treat them as mp3 by default when reading
      },
    }).then((db) => {
      this._db = db;
      return db;
    });
  }
  async getStorageSize(): Promise<number> {
    await this.dbRequest;
    const cursor = await this.db
      .transaction("audioMetadata", "readonly")
      .objectStore("audioMetadata")
      .iterate();
    let total = 0;
    for await (const item of cursor) {
      total += item.value.size;
    }
    return total;
  }
  async getAudio(
    text: string,
    settings: TTSModelOptions,
    format: MediaFormat,
  ): Promise<AudioData | null> {
    await this.dbRequest;
    const hash = hashAudioInputs(text, settings, format);
    const got = await this.db.get("audio", hash);
    const buff = await got?.blob.arrayBuffer();
    if (got && buff) {
      const now = Date.now().valueOf();
      const metadata =
        (await this.db.get("audioMetadata", hash)) ||
        ({
          lastread: now,
          size: buff.byteLength,
          hash,
          format: got.format ?? ("mp3" as MediaFormat),
        } as const);
      await this.db.put("audioMetadata", { ...metadata, lastread: now });
    }
    return got && buff
      ? { data: buff, format: got.format ?? ("mp3" as MediaFormat) }
      : null;
  }
  async saveAudio(
    text: string,
    settings: TTSModelOptions,
    audio: AudioData,
  ): Promise<void> {
    await this.dbRequest;
    const hash = hashAudioInputs(text, settings, audio.format);
    await this.db.put("audio", {
      hash,
      blob: new Blob([audio.data]),
      format: audio.format,
    });
    await this.db.put("audioMetadata", {
      hash,
      size: audio.data.byteLength,
      lastread: Date.now().valueOf(),
      format: audio.format,
    });
  }
  async expire(ageInMillis: number = 1000 * 60 * 60 * 24 * 30): Promise<void> {
    await this.dbRequest;
    const tx = this.db.transaction(["audio", "audioMetadata"], "readwrite");
    const cursor = tx
      .objectStore("audioMetadata")
      .index("lastread")
      .iterate(IDBKeyRange.upperBound(Date.now().valueOf() - ageInMillis));

    const promises = [] as Promise<void>[];
    for await (const item of cursor) {
      promises.push(
        Promise.all([
          tx.objectStore("audio").delete(item.value.hash),
          tx.objectStore("audioMetadata").delete(item.value.hash),
        ]).then(() => {}),
      );
    }

    await Promise.all(promises);

    await tx.done;
  }
}
