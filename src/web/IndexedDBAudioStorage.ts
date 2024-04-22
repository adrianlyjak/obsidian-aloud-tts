import { openDB, DBSchema, IDBPDatabase } from "idb";
import { AudioCache, hashAudioInputs } from "../player/AudioCache";
import { TTSModelOptions } from "../player/TTSModel";

interface AudioCacheDB extends DBSchema {
  audio: {
    value: {
      hash: string;
      blob: Blob;
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
    this.dbRequest = openDB<AudioCacheDB>("tts-aloud-db", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("audio")) {
          const audio = db.createObjectStore("audio", {
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
  async getAudio(
    text: string,
    settings: TTSModelOptions,
  ): Promise<ArrayBuffer | null> {
    await this.dbRequest;
    const hash = hashAudioInputs(text, settings);
    const got = await this.db.get("audio", hash);
    if (got) {
      await this.db.put("audio", { ...got, lastread: Date.now().valueOf() });
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
      lastread: Date.now().valueOf(),
    });
  }
  async expire(ageInMillis: number = 1000 * 60 * 60 * 24 * 30): Promise<void> {
    await this.dbRequest;
    const toDelete = await this.db.getAllKeysFromIndex(
      "audio",
      "lastread",
      IDBKeyRange.upperBound(Date.now().valueOf() - ageInMillis),
    );
    const tx = this.db.transaction("audio", "readwrite");
    await Promise.all(toDelete.map((k) => tx.store.delete(k)));
    await tx.done;
  }
}
