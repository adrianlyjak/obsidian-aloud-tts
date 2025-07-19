import { openDB, DBSchema, IDBPDatabase } from "idb";
import { AudioCache, hashAudioInputs } from "../player/AudioCache";
import { TTSModelOptions } from "../models/tts-model";

interface AudioCacheDB extends DBSchema {
  audio: {
    value: {
      hash: string;
      blob: Blob;
    };
    key: string;
  };
  audioMetadata: {
    value: {
      hash: string;
      size: number;
      lastread: number;
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
    this.dbRequest = openDB<AudioCacheDB>("tts-aloud-db", 2, {
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
  ): Promise<ArrayBuffer | null> {
    await this.dbRequest;
    const hash = hashAudioInputs(text, settings);
    const got = await this.db.get("audio", hash);
    const buff = await got?.blob.arrayBuffer();
    if (got) {
      const now = Date.now().valueOf();
      const metadata =
        (await this.db.get("audioMetadata", hash)) ||
        ({ lastread: now, size: buff?.byteLength ?? 0, hash } as const);
      await this.db.put("audioMetadata", { ...metadata, lastread: now });
    }
    return (await got?.blob.arrayBuffer()) || null;
  }
  async saveAudio(
    text: string,
    settings: TTSModelOptions,
    audio: ArrayBuffer,
  ): Promise<void> {
    await this.dbRequest;
    await this.db.put("audio", {
      hash: hashAudioInputs(text, settings),
      blob: new Blob([audio]),
    });
    await this.db.put("audioMetadata", {
      hash: hashAudioInputs(text, settings),
      size: audio.byteLength,
      lastread: Date.now().valueOf(),
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
