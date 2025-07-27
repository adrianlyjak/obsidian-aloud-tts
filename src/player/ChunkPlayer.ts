import * as mobx from "mobx";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSink } from "./AudioSink";
import { AudioSystem } from "./AudioSystem";
import { AudioTextChunk } from "./AudioTextChunk";
import { ChunkLoader } from "./ChunkLoader";
import { CancellablePromise } from "./CancellablePromise";
import { AudioTextContext } from "src/models/tts-model";

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
  private cancelSettingsChange: { cancel: () => void } | undefined = undefined;
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

    this._activate();
  }

  _shouldBeActive(): boolean {
    return (
      !this.isDestroyed &&
      this.activeAudioText.isPlaying &&
      !!this.system.audioStore.activeText &&
      this.activeAudioText.position !== -1
    );
  }
  /** should only be called when this.active is undefined or the current track is finished*/
  async _activate() {
    const BUFFER_AHEAD = 3;
    const CHUNK_CONTEXT_SIZE = 3; // maybe make this configurable

    let toReset: { indexes: number[] } | { all: true } | undefined = undefined;

    const loopMonitorTextForChanges = (): CancellablePromise<void> => {
      return monitorTextForChanges(
        this.activeAudioText,
        BUFFER_AHEAD,
      ).thenCancellable((x) => {
        if (!toReset) {
          toReset = { indexes: [x] };
        } else if (!("all" in toReset)) {
          toReset.indexes.push(x);
        }
        return loopMonitorTextForChanges();
      });
    };

    while (!this.isDestroyed) {
      const foreground = this._shouldBeActive();
      this.cancelDemand?.cancel();
      this.cancelDemand = undefined;
      this.cancelMonitorText?.cancel();
      this.cancelMonitorText = undefined;

      if (
        this.activeAudioText.position === -1 &&
        this.system.audioSink.isPlaying
      ) {
        this.system.audioSink.pause();
      }
      if (toReset) {
        if ("all" in toReset) {
          await this._clearAudio();
        } else if ("indexes" in toReset) {
          // TODO - make this incremental, rather than a hard reset
          await this._clearAudio();
        } else {
          throw new Error("Invalid reset state " + JSON.stringify(toReset));
        }
        toReset = undefined;
      }

      this.cancelDemand = foreground
        ? loadCheckLoop(
            this.system,
            this.chunkLoader,
            BUFFER_AHEAD,
            CHUNK_CONTEXT_SIZE,
          )
        : undefined;
      this.cancelMonitorText = loopMonitorTextForChanges();
      this.cancelSettingsChange = this._whenSettingsChange().thenCancellable(
        () => {
          toReset = { all: true };
        },
      );
      const [start, end] = getLoadedRange(this.activeAudioText);
      const transitionType = await this._onAudioAudioChanged(foreground);

      if (transitionType === "position-changed") {
        const position = this.activeAudioText.position;
        if (start <= position && position <= end) {
          // just jump the audio position if its already loaded to the buffer
          const duration = getSequentialLoadedChunks(this.activeAudioText)
            .slice(0, position - start)
            .reduce((s, x) => s + x.duration!, 0);
          this.system.audioSink.currentTime = duration;
          // wait for seeking event to fire, otherwise seek will fire next iteration
          await CancellablePromise.fromEvent(
            this.system.audioSink.audio,
            "seeking",
          );
        } else {
          toReset = { all: true };
          // hard immediate reset if the position is outside the bounds of the loaded audio
          await this._clearAudio();
          this.cancelDemand?.cancel();

          while (true) {
            // debounce the updates to the position
            const result = await CancellablePromise.race([
              CancellablePromise.delay(250).thenCancellable(() => "timeout"),
              this._whenPositionChanges(),
            ]);
            if (result === "timeout") {
              break;
            }
          }
          if (this.activeAudioText.position === -1) {
            this.system.audioSink.pause();
          }
        }
      } else if (transitionType === "chunk-complete") {
        this.activeAudioText.goToNext();
        if (this.activeAudioText.position === -1) {
          this.system.audioSink.pause();
          await this._clearAudio();
        }
      } else if (transitionType === "seeked") {
        const position = getPositionAccordingToPlayback(
          this.activeAudioText,
          this.system.audioSink,
        );

        this.activeAudioText.setPosition(position.position);
        if (position.type !== "Position") {
          toReset = { all: true };
        }
      } else if (transitionType === "play-paused") {
        // just reset the loop to re-watch the state
      }
    }
  }

  _deactivate() {
    this.cancelSettingsChange?.cancel();
    this.cancelSettingsChange = undefined;
    this.cancelDemand?.cancel();
    this.cancelDemand = undefined;
    this.cancelMonitorText?.cancel();
    this.cancelMonitorText = undefined;
  }

  destroy() {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.chunkLoader.destroy();
    this._clearAudio().then(() => {});
    this._deactivate();
  }

  async _clearAudio() {
    this._clearChunks();
    this.chunkLoader.expireBefore();
    await this.system.audioSink.clearMedia();
  }

  _clearChunks() {
    for (const chunk of this.activeAudioText.audio.chunks) {
      const wasLoaded = !!chunk.audio;
      chunk.reset();
      if (wasLoaded) {
        this.chunkLoader.uncache(chunk.text);
      }
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
    return CancellablePromise.fromEvent(
      this.system.audioSink.audio,
      "seeking",
    ).thenCancellable(() => "seeked");
  }

  _whenPlayPaused(): CancellablePromise<"play-paused"> {
    const initial = this.system.audioSink.isPlaying;
    return CancellablePromise.from(
      mobx.when(() => this.system.audioSink.isPlaying !== initial),
    ).thenCancellable(() => "play-paused");
  }

  _onAudioAudioChanged(
    foreground: boolean,
  ): CancellablePromise<
    | "position-changed"
    | "chunk-complete"
    | "seeked"
    | "play-paused"
    | "settings-changed"
  > {
    return CancellablePromise.race(
      (
        [
          this._whenPositionChanges(),
          this._whenPlayPaused(),
          this._whenSettingsChange(),
          this._whenSeeked(),
        ] as CancellablePromise<TransitionType>[]
      ).concat(foreground ? [this._whenCurrentChunkDonePlaying()] : []),
    );
  }

  _whenSettingsChange(): CancellablePromise<"settings-changed"> {
    const init = JSON.stringify(
      this.system.ttsModel.convertToOptions(this.system.settings),
    );
    return CancellablePromise.from(
      mobx.when(
        () =>
          JSON.stringify(
            this.system.ttsModel.convertToOptions(this.system.settings),
          ) !== init,
      ),
    ).thenCancellable(() => "settings-changed");
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
    const currentTime = audioSink.currentTime;
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
    return { type: "BeforeLoaded", position: Math.max(0, start - 1) };
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
  return {
    type: "AfterLoaded",
    position: Math.min(end, active.audio.chunks.length),
  };
}

const indexesToLoad = (
  activeAudioText: ActiveAudioText,
  maxBufferAhead: number,
) => {
  const next = nextToLoad(activeAudioText, maxBufferAhead);
  if (next === null) {
    return [];
  }
  const max = Math.min(
    activeAudioText.audio.chunks.length,
    activeAudioText.position + maxBufferAhead,
  );
  return [...Array(maxBufferAhead).fill(0)]
    .map((_, i) => next + i)
    .filter((x) => x < max);
};

type PlaybackPosition =
  | { type: "BeforeLoaded"; position: number }
  | { type: "AfterLoaded"; position: number }
  | { type: "Position"; position: number };

function getContext(
  chunks: AudioTextChunk[],
  index: number,
  audioContextChunks: number,
): AudioTextContext {
  const before = chunks.slice(Math.max(0, index - audioContextChunks), index);
  const after = chunks.slice(index + 1, index + 1 + audioContextChunks);
  return {
    textBefore: before.map((x) => x.text).join(""),
    textAfter: after.map((x) => x.text).join(""),
  };
}

/**
 * Loads the next audio, if any, and returns the audio buffer (if not interrupted)
 * @param audioContextChunks - the number of chunks to include in the "context" when calling the TTS model.
 *                             To make audio transitions smoother.
 */
const loadCheck = async (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
  isCancelled: () => boolean,
  audioContextChunks: number,
): Promise<[AudioTextChunk, ArrayBuffer] | undefined> => {
  const activeText = system.audioStore.activeText!;
  const currentPosition = activeText.position;

  logDebug(
    `loadCheck ENTER currentPosition=${currentPosition} maxBufferAhead=${maxBufferAhead}`,
  );

  const indexes = indexesToLoad(activeText, maxBufferAhead);
  logDebug(`loadCheck indexesToLoad result=[${indexes.join(",")}]`);

  if (indexes.length === 0) {
    logDebug(`loadCheck EXIT no indexes to load`);
    return;
  }

  const chunks = activeText.audio.chunks;
  const chunkStates = indexes.map((i) => ({
    index: i,
    hasAudio: !!chunks[i]?.audio,
    loading: chunks[i]?.loading,
    text:
      chunks[i]?.text.slice(0, 50) + (chunks[i]?.text.length > 50 ? "..." : ""),
  }));
  logDebug(`loadCheck chunk states: ${JSON.stringify(chunkStates)}`);

  // kick off the preload
  const modelOpts = system.ttsModel.convertToOptions(system.settings);
  logDebug(`loadCheck starting preloads for indexes=[${indexes.join(",")}]`);

  for (const index of indexes) {
    const chunk = chunks[index];
    const context = getContext(chunks, index, audioContextChunks);
    if (chunk?.text.trim()) {
      logDebug(
        `loadCheck preload index=${index} chunkHasAudio=${!!chunk.audio} chunkLoading=${chunk.loading} textLength=${chunk.text.length}`,
      );
      chunkLoader.preload(chunk.text, modelOpts, index, context);
    } else {
      logDebug(
        `loadCheck skipping preload index=${index} - empty text or no chunk`,
      );
    }
  }

  const position = indexes[0];
  const chunk = chunks[position];
  const context = getContext(chunks, position, audioContextChunks);
  const text = chunk.text;

  logDebug(
    `loadCheck targeting position=${position} chunkHasAudio=${!!chunk.audio} chunkLoading=${chunk.loading} textLength=${text.length}`,
  );

  // Check if already loaded/loading before proceeding
  if (chunk.audio) {
    logDebug(
      `loadCheck WARNING chunk at position=${position} already has audio - potential duplicate!`,
    );
  }
  if (chunk.loading) {
    logDebug(
      `loadCheck WARNING chunk at position=${position} already loading - potential race condition!`,
    );
  }

  // then wait for the next one to complete
  chunk.setLoading();
  logDebug(`loadCheck set chunk position=${position} to loading state`);

  let audio: ArrayBuffer;
  try {
    logDebug(
      `loadCheck calling chunkLoader.load for position=${position} textLength=${text.length}`,
    );
    audio = await chunkLoader.load(text, modelOpts, context);
    logDebug(
      `loadCheck chunkLoader.load completed position=${position} audioByteLength=${audio.byteLength}`,
    );
  } catch (e) {
    logDebug(
      `loadCheck chunkLoader.load FAILED position=${position} error=${e}`,
    );
    chunk.setFailed(e);
    throw e;
  }

  if (isCancelled()) {
    logDebug(
      `loadCheck cancelled after load position=${position} - discarding audio`,
    );
    return;
  } else {
    logDebug(
      `loadCheck setting chunk position=${position} to loaded state audioByteLength=${audio.byteLength}`,
    );
    chunk.setLoaded(audio);
    logDebug(`loadCheck EXIT returning chunk position=${position}`);
    return [chunk, audio] as const;
  }
};

function logDebug(message: string) {
  console.log(
    `[ChunkPlayer] date=${new Date().toISOString()} message=${message}`,
  );
}
const loadCheckLoop = (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
  audioContextChunks: number,
): CancellablePromise<void> => {
  let cancelled = false;
  const inner = (): Promise<void> => {
    const position = nextToLoad(system.audioStore.activeText!, maxBufferAhead);
    chunkLoader.expireBefore(system.audioStore.activeText!.position);
    return loadCheck(
      system,
      chunkLoader,
      maxBufferAhead,
      () => cancelled,
      audioContextChunks,
    ).then((maybe) => {
      const activeText = system.audioStore.activeText;
      if (maybe && activeText && position !== null && !cancelled) {
        const [chunk, result] = maybe;
        logDebug(
          `appendMedia text=${chunk.text} loading=${chunk.loading} hasAudio=${!!chunk.audio} hasBuffer=${!!chunk.audioBuffer} length=${result.byteLength}`,
        );
        chunk.setLoaded(result);
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
    });
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

type TransitionType =
  | "position-changed"
  | "play-paused"
  | "settings-changed"
  | "chunk-complete"
  | "seeked";
