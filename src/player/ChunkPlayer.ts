import * as mobx from "mobx";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSink } from "./AudioSink";
import { AudioSystem } from "./AudioSystem";
import { AudioTextChunk } from "./AudioTextChunk";
import { ChunkLoader } from "./ChunkLoader";
import { toModelOptions } from "./TTSModel";
import { CancellablePromise } from "./CancellablePromise";

/**
 * Effectively the inner loop for the audio text.
 *
 * Is loaded with a track: a piece of observable text chunks from the ActiveAudioText.
 *
 * Once created, it listens for play/pause events from the audio sink. Once playing,
 * it starts a process of pre-loading chunks and acting as a data source for the
 * audio sink.
 *
 * Needs to pre-buffer data into the audio sink for seamless playback and easy skipping around.
 *
 * Complicated part is resetting the audio
 *
 */
export class ChunkPlayer {
  private activeAudioText: ActiveAudioText;
  private system: AudioSystem;
  private isDestroyed = false;

  private cancelDemand: { cancel: () => void } | undefined = undefined;
  private cancelMonitorText: { cancel: () => void } | undefined = undefined;
  private chunkLoader: ChunkLoader;

  constructor({
    activeAudioText,
    system,
  }: {
    activeAudioText: ActiveAudioText;
    system: AudioSystem;
  }) {
    this.activeAudioText = activeAudioText;
    this.system = system;

    this.chunkLoader = new ChunkLoader({
      system,
    });

    mobx.makeObservable(this, {
      _activate: mobx.action,
      _clearChunks: mobx.action,
    });

    mobx.reaction(
      () => this.activeAudioText.isPlaying,
      (isPlaying) => {
        if (this._shouldBeActive()) {
          this._activate();
        } else {
          this._deactivate();
        }
      },
      {
        fireImmediately: true,
      },
    );
  }

  _shouldBeActive() {
    return (
      !this.isDestroyed &&
      this.activeAudioText.isPlaying &&
      this.system.audioStore.activeText
    );
  }

  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    const BUFFER_AHEAD = 4;

    let toReset: { indexes: number[] } | { all: true } | undefined = undefined;

    const loopMonitorTextForChanges = (): CancellablePromise<void> => {
      return monitorTextForChanges(
        this.activeAudioText,
        BUFFER_AHEAD,
      ).thenCancellable((x) => {
        this.cancelDemand?.cancel();
        this.cancelDemand = undefined;
        if (!toReset) {
          toReset = { indexes: [x] };
        } else if (!("all" in toReset)) {
          toReset.indexes.push(x);
        }
        return loopMonitorTextForChanges();
      });
    };

    while (this._shouldBeActive()) {
      this.cancelDemand?.cancel();
      this.cancelDemand = undefined;
      this.cancelMonitorText?.cancel();
      this.cancelMonitorText = undefined;

      if (toReset) {
        if ("all" in toReset) {
          await this.system.audioSink.clearMedia();
          this._clearChunks();
        } else if ("indexes" in toReset) {
          // TODO - make this incremental, rather than a hard reset
          // const indexes: number[] = (toReset as any).indexes;
          // const currentPosition = this.activeAudioText.position;
          // const before = indexes.filter((x) => x < currentPosition);
          // const after = indexes.filter((x) => x >= currentPosition);
          // const [low, high] = getLoadedRange(this.activeAudioText);
          // if (after.length > 0) {
          //   const min = Math.min(...after);
          //   const chunks = this.activeAudioText.audio.chunks.slice(min, high);
          //   const duration = chunks.reduce((acc, x) => acc + (x.duration || 0), 0);
          //   this.system.audioSink.clearMedia()
          // }
          // if (before.length > 0) {
          //   const max = Math.max(...before);
          // }
          await this.system.audioSink.clearMedia();
          this._clearChunks();
        } else {
          throw new Error("Invalid reset state " + JSON.stringify(toReset));
        }
        toReset = undefined;
      }

      this.cancelDemand = loadCheckLoop(
        this.system,
        this.chunkLoader,
        BUFFER_AHEAD,
      );
      this.cancelMonitorText = loopMonitorTextForChanges();
      const [start, end] = getLoadedRange(this.activeAudioText);
      const transitionType = await this._chunkDoneOrInterrupted();
      if (transitionType === "position-changed") {
        const position = this.activeAudioText.position;
        if (start <= position && position <= end) {
          // just jump the audio position if its already loaded to the buffer
          const duration = getSequentialLoadedChunks(this.activeAudioText)
            .slice(0, position - start)
            .reduce((s, x) => s + x.duration!, 0);
          this.system.audioSink.audio.currentTime = duration;
        } else {
          toReset = { all: true };
          // hard immediate reset if the position is outside the bounds of the loaded audio
          await this.system.audioSink.clearMedia();
          this._clearChunks();
          this.cancelDemand?.cancel();

          while (true) {
            // debounce the updates to the position
            const result = await CancellablePromise.race([
              CancellablePromise.delay(500).thenCancellable(() => "timeout"),
              this._whenPositionChanges(),
            ]);
            if (result === "timeout") {
              break;
            }
          }
        }
      } else if (transitionType === "chunk-complete") {
        this.activeAudioText.goToNext();
        if (this.activeAudioText.position === -1) {
          this.system.audioSink.pause();
          break;
        }
      } else if (transitionType === "seeked") {
        const position = getPositionAccordingToPlayback(
          this.activeAudioText,
          this.system.audioSink,
        );
        if (position.type === "AfterLoaded") {
          this.activeAudioText.goToNext();
        } else if (position.type === "BeforeLoaded") {
          this.activeAudioText.goToPrevious();
        } else {
          this.activeAudioText.setPosition(position.position);
        }
      } else if (transitionType === "paused") {
        break;
      }
    }
  }

  _deactivate() {
    this.cancelDemand?.cancel();
    this.cancelDemand = undefined;
    this.cancelMonitorText?.cancel();
    this.cancelMonitorText = undefined;
  }

  /** preload data for upcoming tracks */
  _populateUpcoming = () => {
    // somewhat intentional bug-like behavior here. This is non-reactive to user edits on the text.
    // if a user edits some text, this will load the text on demand, rather than upcoming

    this.chunkLoader.expireBefore(this.activeAudioText.position);
    this.activeAudioText.audio.chunks
      .filter((x) => !!x.text.trim())
      .slice(this.activeAudioText.position, this.activeAudioText.position + 3)
      .forEach((x, i) => {
        this.chunkLoader.preload(
          x.text,
          toModelOptions(this.system.settings),
          this.activeAudioText.position + i,
        );
      });
  };

  destroy() {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.chunkLoader.destroy();
    this._clearChunks();
    this.system.audioSink.clearMedia();
    this.cancelDemand?.cancel();
    this.cancelDemand = undefined;
    this.cancelMonitorText?.cancel();
    this.cancelMonitorText = undefined;
    this.system.audioSink.pause();
  }

  _clearChunks() {
    for (const chunk of this.activeAudioText.audio.chunks) {
      chunk.reset();
    }
  }

  _whenPositionChanges(): CancellablePromise<"position-changed"> {
    const position = this.activeAudioText.position;
    return CancellablePromise.from(
      mobx.when(() => this.activeAudioText.position !== position),
    ).thenCancellable<"position-changed">((x) => "position-changed");
  }

  _whenCurrentChunkDonePlaying(): CancellablePromise<"chunk-complete"> {
    return whenCurrentChunkDonePlaying(this.system).thenCancellable(
      () => "chunk-complete",
    );
  }
  _whenSeeked(): CancellablePromise<"seeked"> {
    const deferred = CancellablePromise.deferred<"seeked">();
    const onSeeked = () => deferred.resolve("seeked");
    this.system.audioSink.audio.addEventListener("seeked", onSeeked, {
      once: true,
    });
    deferred.cancelFn(() =>
      this.system.audioSink.audio.removeEventListener("seeked", onSeeked),
    );
    return deferred.promise;
  }

  _whenPaused(): CancellablePromise<"paused"> {
    return CancellablePromise.from(
      mobx.when(() => !this.system.audioSink.isPlaying),
    ).thenCancellable(() => "paused");
  }
  _chunkDoneOrInterrupted(): CancellablePromise<
    "position-changed" | "chunk-complete" | "seeked" | "paused"
  > {
    const whenAdvanced = this._whenCurrentChunkDonePlaying();
    const whenPositionChanges = this._whenPositionChanges();
    const whenPaused = this._whenPaused();
    // const whenSeeked = this._whenSeeked();
    return CancellablePromise.race([
      whenAdvanced,
      whenPositionChanges,
      whenPaused,
      // whenSeeked,
    ]);
  }
}

const whenCurrentChunkDonePlaying = (
  system: AudioSystem,
): CancellablePromise<void> => {
  const active = system.audioStore.activeText;
  const settings = system.settings;
  const audioSink = system.audioSink;
  const chunk = active?.currentChunk;
  if (!chunk) {
    return CancellablePromise.resolve();
  }
  let lastCurrentTime: number | undefined;
  const innerLoop = (): CancellablePromise<void> => {
    if (!active.isPlaying) {
      return CancellablePromise.resolve();
    }
    const loadedChunks = getSequentialLoadedChunks(active);
    const index = loadedChunks.findIndex((x) => x === chunk);
    if (index === -1 || active.currentChunk !== chunk) {
      return CancellablePromise.resolve();
    }
    const duration = loadedChunks
      .slice(0, index + 1)
      .reduce((acc, x) => acc + (x.duration || 0), 0);
    const currentTime = audioSink.audio.currentTime;
    const hasNotProgressed = lastCurrentTime && currentTime === lastCurrentTime;
    lastCurrentTime = currentTime;
    const remaining = duration - currentTime;
    // frequently seems to report lower duration before the reported total duration, so
    // this is necessary otherwise it will stall
    if (remaining <= 0.1 || (hasNotProgressed && remaining < 1)) {
      return CancellablePromise.resolve();
    }
    const speed = settings.playbackSpeed;
    const playbackMultiple = (remaining * 1000) / speed;
    const playbackChanged = CancellablePromise.from(
      mobx.when(() => settings.playbackSpeed !== speed),
    );
    const delayPromise = CancellablePromise.delay(playbackMultiple);
    return CancellablePromise.race([
      playbackChanged,
      delayPromise,
    ]).thenCancellable(() => innerLoop());
  };
  return chunk.onceLoaded(true).thenCancellable(innerLoop);
};

function getLoadedRange(active: ActiveAudioText): [number, number] {
  let low = active.position; // inclusive
  let high = active.position; // exclusive
  const isLoaded = (x?: AudioTextChunk) =>
    x?.audio && typeof x?.duration === "number";
  while (low > 0 && isLoaded(active.audio.chunks[low - 1])) {
    low--;
  }
  while (
    high < active.audio.chunks.length &&
    isLoaded(active.audio.chunks[high])
  ) {
    high++;
  }
  return [low, high];
}

function getSequentialLoadedChunks(active: ActiveAudioText): AudioTextChunk[] {
  const [low, high] = getLoadedRange(active);
  return active.audio.chunks.slice(low, high);
}

function nextToLoad(
  active: ActiveAudioText,
  maxBufferAhead: number,
): number | null {
  if (active.position === -1) {
    return null;
  }
  const max = Math.min(
    active.audio.chunks.length,
    active.position + maxBufferAhead,
  );
  const [_, loadedHigh] = getLoadedRange(active);
  return loadedHigh < max ? loadedHigh : null;
}

/**
 * Finds the index of the chunk that the audio playback is currently at.
 * @returns
 */
function getPositionAccordingToPlayback(
  active: ActiveAudioText,
  audioSink: AudioSink,
): PlaybackPosition {
  const [start, end] = getLoadedRange(active);
  const loaded = active.audio.chunks.slice(start, end);
  if (loaded.length === 0) {
    return { type: "BeforeLoaded" };
  }
  const audioPosition = audioSink.audio.currentTime;

  let running = 0;
  for (let i = 0; i < loaded.length; i++) {
    const chunk = loaded[i];
    running += chunk.duration!;
    if (running >= audioPosition) {
      return { type: "Position", position: start + i };
    }
  }
  return { type: "AfterLoaded" };
}

const indexesToLoad = (
  activeAudioText: ActiveAudioText,
  maxBufferAhead: number,
) => {
  const next = nextToLoad(activeAudioText, maxBufferAhead);
  console.log({ nextToLoad: next });
  if (next === null) {
    return [];
  }
  const max = activeAudioText.audio.chunks.length;
  return [...Array(maxBufferAhead).fill(0)]
    .map((_, i) => next + i)
    .filter((x) => x < max);
};

type PlaybackPosition =
  | { type: "BeforeLoaded" }
  | { type: "AfterLoaded" }
  | { type: "Position"; position: number };

/**
 * Loads the next audio, if any, and returns the audio buffer (if not interrupted)
 */
const loadCheck = async (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
  isCancelled: () => boolean,
): Promise<ArrayBuffer | undefined> => {
  const indexes = indexesToLoad(system.audioStore.activeText!, maxBufferAhead);
  if (indexes.length === 0) {
    return;
  }

  // kick off the preload
  const modelOpts = toModelOptions(system.settings);
  for (const index of indexes) {
    const chunk = system.audioStore.activeText!.audio.chunks[index];
    if (chunk?.text.trim()) {
      chunkLoader.preload(chunk.text, modelOpts, index);
    }
  }

  const position = indexes[0];
  const chunk = system.audioStore.activeText!.audio.chunks[position];
  console.log({ chunk, position, indexes });
  const text = chunk.text;

  // then wait for the next one to complete
  chunk.setLoading();
  let audio: ArrayBuffer;
  try {
    audio = await chunkLoader.load(text, modelOpts);
  } catch (e) {
    chunk.setFailed(e);
    throw e;
  }

  if (isCancelled()) {
    return;
  } else {
    chunk.setLoaded(audio);
    return audio;
  }
};

const loadCheckLoop = (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
): CancellablePromise<void> => {
  let cancelled = false;
  const inner = (): Promise<void> => {
    const position = nextToLoad(system.audioStore.activeText!, maxBufferAhead);
    return loadCheck(system, chunkLoader, maxBufferAhead, () => cancelled).then(
      (result) => {
        const activeText = system.audioStore.activeText;
        if (result && activeText && position !== null && !cancelled) {
          activeText.audio.chunks[position].setLoaded(result);
          return system.audioSink
            .appendMedia(result)
            .then(() => system.audioSink.getAudioBuffer(result))
            .then((buff) => {
              const chunk = activeText.audio.chunks[position];
              if (chunk.audio) {
                const offsetDuration = activeText.audio.chunks
                  .slice(0, position)
                  .reduce((acc, x) => acc + (x.duration || 0), 0);
                activeText.audio.chunks[position].setAudioBuffer(
                  buff,
                  offsetDuration,
                );
              } else {
                chunk.reset(); // something interrupted, so reset
              }
            })
            .then(() => inner());
        } else {
          return Promise.resolve();
        }
      },
    );
  };
  return CancellablePromise.cancelFn(inner(), () => {
    cancelled = true;
  });
};

function monitorTextForChanges(
  active: ActiveAudioText,
  maxBufferAhead: number,
): CancellablePromise<number> {
  const [low, high] = getLoadedRange(active);
  const toLoad = indexesToLoad(active, maxBufferAhead);
  const toMonitor = active.audio.chunks.slice(low, high + toLoad.length);
  function getState() {
    return toMonitor.map((x) => x.rawText);
  }
  function diffIndex(a: string[], b: string[]) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return i;
      }
    }
    return -1;
  }
  const before = getState();
  return CancellablePromise.from(
    mobx.when(() => diffIndex(getState(), before) !== -1),
  ).thenCancellable((x) => {
    return diffIndex(getState(), before);
  });
}
