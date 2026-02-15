import * as mobx from "mobx";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSink } from "./AudioSink";
import { AudioSystem } from "./AudioSystem";
import { AudioTextChunk } from "./AudioTextChunk";
import { ChunkLoader } from "./ChunkLoader";
import { CancellablePromise } from "./CancellablePromise";
import { AudioTextContext } from "src/models/tts-model";
import { AudioData } from "src/models/tts-model";

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
  private playbackTimelineEpoch = 0;
  private playbackTimelineCursorSeconds = 0;
  private _seekedAtTime: number | undefined;

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
      _rotateTimelineEpoch: mobx.action,
    });

    this._rotateTimelineEpoch();
    this._activate();
  }

  _rotateTimelineEpoch() {
    this.playbackTimelineEpoch += 1;
    this.playbackTimelineCursorSeconds = 0;
  }

  private _chunkHasCurrentEpochTimeline(chunk: AudioTextChunk): boolean {
    return (
      chunk.timelineEpoch === this.playbackTimelineEpoch &&
      chunk.timelineStartSeconds != null &&
      chunk.timelineEndSeconds != null
    );
  }

  private _assignTimelineForChunk(
    activeText: ActiveAudioText,
    position: number,
    duration: number,
  ): { timelineStartSeconds: number; timelineEpoch: number } {
    const chunk = activeText.audio.chunks[position];
    if (chunk && this._chunkHasCurrentEpochTimeline(chunk)) {
      this.playbackTimelineCursorSeconds = Math.max(
        this.playbackTimelineCursorSeconds,
        chunk.timelineEndSeconds!,
      );
      return {
        timelineStartSeconds: chunk.timelineStartSeconds!,
        timelineEpoch: this.playbackTimelineEpoch,
      };
    }

    const previousChunk = activeText.audio.chunks[position - 1];
    if (
      previousChunk &&
      previousChunk.timelineEpoch === this.playbackTimelineEpoch &&
      previousChunk.timelineEndSeconds != null
    ) {
      const timelineStartSeconds = previousChunk.timelineEndSeconds;
      this.playbackTimelineCursorSeconds = Math.max(
        this.playbackTimelineCursorSeconds,
        timelineStartSeconds + duration,
      );
      return {
        timelineStartSeconds,
        timelineEpoch: this.playbackTimelineEpoch,
      };
    }

    const nextChunk = activeText.audio.chunks[position + 1];
    if (
      nextChunk &&
      nextChunk.timelineEpoch === this.playbackTimelineEpoch &&
      nextChunk.timelineStartSeconds != null
    ) {
      const timelineStartSeconds = Math.max(
        0,
        nextChunk.timelineStartSeconds - duration,
      );
      this.playbackTimelineCursorSeconds = Math.max(
        this.playbackTimelineCursorSeconds,
        timelineStartSeconds + duration,
      );
      return {
        timelineStartSeconds,
        timelineEpoch: this.playbackTimelineEpoch,
      };
    }

    const timelineStartSeconds = this.playbackTimelineCursorSeconds;
    this.playbackTimelineCursorSeconds += duration;
    return { timelineStartSeconds, timelineEpoch: this.playbackTimelineEpoch };
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
            (activeText, position, duration) =>
              this._assignTimelineForChunk(activeText, position, duration),
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
          const targetChunk = this.activeAudioText.audio.chunks[position];
          const timelineStart = targetChunk?.timelineStartSeconds;
          if (
            targetChunk &&
            this._chunkHasCurrentEpochTimeline(targetChunk) &&
            timelineStart != null
          ) {
            // Seek directly to the chunk's monotonic timeline start.
            this.system.audioSink.currentTime = timelineStart;
          } else {
            toReset = { all: true };
            await this._clearAudio();
            continue;
          }
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
        const seekedAtTime = this._seekedAtTime;
        this._seekedAtTime = undefined;

        // Check if the seek target is before the buffered range
        const buffered = this.system.audioSink.audio.buffered;
        const bufferedStart =
          buffered && buffered.length > 0 ? buffered.start(0) : undefined;
        if (
          seekedAtTime != null &&
          bufferedStart != null &&
          seekedAtTime < bufferedStart
        ) {
          // Before-buffer seek: use timeline metadata to find the target chunk
          const resolved = getChunkPositionForTimelineTime(
            this.activeAudioText,
            seekedAtTime,
          );
          this.activeAudioText.setPosition(resolved);
          toReset = { all: true };
        } else {
          const position = getPositionAccordingToPlayback(
            this.activeAudioText,
            this.system.audioSink,
          );
          this.activeAudioText.setPosition(position.position);
          if (position.type !== "Position") {
            toReset = { all: true };
          }
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
    this._rotateTimelineEpoch();
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
    const baseline = this.system.audioSink.audio.currentTime;
    return CancellablePromise.fromEvent(
      this.system.audioSink.audio,
      "seeking",
    ).thenCancellable(() => {
      const newTime = this.system.audioSink.audio.currentTime;
      if (Math.abs(newTime - baseline) < 0.5) {
        // Spurious event (e.g. from clearMedia or chunk loading) — re-listen
        return this._whenSeeked();
      }
      // Capture pre-clamp time synchronously before _onseeked clamps it
      this._seekedAtTime = newTime;
      return "seeked" as const;
    });
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
    if (active.currentChunk !== chunk) {
      return CancellablePromise.resolve();
    }
    const chunkEnd = chunk.timelineEndSeconds;
    if (chunkEnd == null) {
      return CancellablePromise.delay(100).thenCancellable(() => innerLoop());
    }
    const currentTime = audioSink.currentTime;
    const hasNotProgressed = lastCurrentTime && currentTime === lastCurrentTime;
    lastCurrentTime = currentTime;
    const remaining = chunkEnd - currentTime;
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
  const isLoaded = (x?: AudioTextChunk) => x?.audio && x.duration != null;
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
export function getPositionAccordingToPlayback(
  active: ActiveAudioText,
  audioSink: AudioSink,
): PlaybackPosition {
  const [start, end] = getLoadedRange(active);
  const loadedWithTimeline = active.audio.chunks
    .slice(start, end)
    .map((chunk, index) => ({
      chunk,
      position: start + index,
    }))
    .filter(
      (item) =>
        item.chunk.timelineStartSeconds != null &&
        item.chunk.timelineEndSeconds != null,
    );
  const activeEpoch = loadedWithTimeline.reduce<number | undefined>(
    (latest, item) => {
      if (item.chunk.timelineEpoch == null) {
        return latest;
      }
      if (latest == null) {
        return item.chunk.timelineEpoch;
      }
      return Math.max(latest, item.chunk.timelineEpoch);
    },
    undefined,
  );
  const loaded =
    activeEpoch != null
      ? loadedWithTimeline.filter(
          (item) => item.chunk.timelineEpoch === activeEpoch,
        )
      : loadedWithTimeline;
  if (loaded.length === 0) {
    return { type: "BeforeLoaded", position: Math.max(0, start - 1) };
  }
  const audioPosition = audioSink.audio.currentTime;

  for (let i = 0; i < loaded.length; i++) {
    const { chunk, position } = loaded[i];
    const chunkStart = chunk.timelineStartSeconds!;
    const chunkEnd = chunk.timelineEndSeconds!;
    if (audioPosition < chunkStart) {
      return { type: "BeforeLoaded", position: Math.max(0, position - 1) };
    }
    if (audioPosition <= chunkEnd) {
      return { type: "Position", position };
    }
  }
  const lastLoadedPosition = loaded[loaded.length - 1]!.position;
  return {
    type: "AfterLoaded",
    position: Math.min(lastLoadedPosition + 1, active.audio.chunks.length),
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

/**
 * Maps a timeline time (seconds) back to a chunk index using preserved
 * timeline metadata. Evicted chunks retain timelineStartSeconds/timelineEndSeconds
 * even after their audio data is dropped, so this works for seeking into
 * evicted regions. Falls back to chunk 0 if no timeline data is found.
 */
function getChunkPositionForTimelineTime(
  active: ActiveAudioText,
  timeSeconds: number,
): number {
  const chunks = active.audio.chunks;
  // Search all chunks (including evicted) for one whose timeline range contains the target
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (
      chunk.timelineStartSeconds != null &&
      chunk.timelineEndSeconds != null
    ) {
      if (
        timeSeconds >= chunk.timelineStartSeconds &&
        timeSeconds <= chunk.timelineEndSeconds
      ) {
        return i;
      }
    }
  }
  // If target is before the first chunk with timeline data, return that chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.timelineStartSeconds != null) {
      if (timeSeconds < chunk.timelineStartSeconds) {
        return i;
      }
    }
  }
  // Fallback: no timeline data at all, go to beginning
  return 0;
}

function getBufferedStart(audio: HTMLAudioElement): number | undefined {
  const buffered = audio.buffered;
  if (!buffered || buffered.length === 0) {
    return undefined;
  }
  return buffered.start(0);
}

function pruneEvictedChunkState(
  activeText: ActiveAudioText,
  audioSink: AudioSink,
  chunkLoader: ChunkLoader,
): void {
  const bufferedStart = getBufferedStart(audioSink.audio);
  if (bufferedStart == null) {
    return;
  }

  for (const chunk of activeText.audio.chunks) {
    if (!chunk.audio || chunk.timelineEndSeconds == null) {
      continue;
    }
    const chunkEnd = chunk.timelineEndSeconds;
    if (chunkEnd <= bufferedStart) {
      // SourceBuffer has already evicted this media range from the HTMLAudioElement
      // playback window. Drop chunk bytes/state so it can be reloaded on demand,
      // but preserve timing metadata for stable seek mapping.
      chunk.evictAudioData();
      chunkLoader.uncache(chunk.text);
    }
  }
}

function releaseDecodedAudioBuffersBehindPosition(
  activeText: ActiveAudioText,
): void {
  // This is distinct from SourceBuffer eviction:
  // - SourceBuffer eviction (AudioSink) trims media bytes retained by the media element.
  // - This function releases decoded PCM AudioBuffers kept on chunk objects.
  //
  // Keep 1 chunk behind for smoother near-backward transitions.
  const currentPos = activeText.position;
  for (let i = 0; i < currentPos - 1; i++) {
    const oldChunk = activeText.audio.chunks[i];
    if (oldChunk?.audioBuffer) {
      oldChunk.releaseAudioBuffer();
    }
  }
}

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
): Promise<[AudioTextChunk, AudioData] | undefined> => {
  const activeText = system.audioStore.activeText!;

  const indexes = indexesToLoad(activeText, maxBufferAhead);

  if (indexes.length === 0) {
    return;
  }

  const chunks = activeText.audio.chunks;

  // kick off the preload
  const modelOpts = system.ttsModel.convertToOptions(system.settings);

  for (const index of indexes) {
    const chunk = chunks[index];
    const context = getContext(chunks, index, audioContextChunks);
    if (chunk?.text.trim()) {
      chunkLoader.preload(chunk.text, modelOpts, index, context);
    }
  }

  const position = indexes[0];
  const chunk = chunks[position];
  const context = getContext(chunks, position, audioContextChunks);
  const text = chunk.text;

  // then wait for the next one to complete
  chunk.setLoading();

  let audio: AudioData;
  try {
    audio = await chunkLoader.load(text, modelOpts, context);
  } catch (e) {
    chunk.setFailed(e);
    throw e;
  }

  if (isCancelled()) {
    return;
  } else {
    chunk.setLoaded(audio);
    return [chunk, audio] as const;
  }
};

const loadCheckLoop = (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
  audioContextChunks: number,
  assignTimeline: (
    activeText: ActiveAudioText,
    position: number,
    duration: number,
  ) => { timelineStartSeconds: number; timelineEpoch: number },
): CancellablePromise<void> => {
  let cancelled = false;
  const inner = (): Promise<void> => {
    // TODO - this process is not great between here and the loadCheck.
    // There's been some race conditions related to the current position.
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
        chunk.setLoaded(result);
        // Clone the buffer before appending to prevent detachment during decodeAudioData
        const bufferForAppend = result.data.slice(0);
        return system.audioSink
          .appendMedia(bufferForAppend)
          .then(() => system.audioSink.getAudioBuffer(result.data))
          .then((buff) => {
            const chunk = activeText.audio.chunks[position];
            if (chunk.audio) {
              const timeline = assignTimeline(
                activeText,
                position,
                buff.duration,
              );
              activeText.audio.chunks[position].setAudioBuffer(
                buff,
                timeline.timelineStartSeconds,
                timeline.timelineEpoch,
              );
              pruneEvictedChunkState(activeText, system.audioSink, chunkLoader);
              releaseDecodedAudioBuffersBehindPosition(activeText);
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
