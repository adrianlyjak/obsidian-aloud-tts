import * as mobx from "mobx";
import { ActiveAudioText } from "./ActiveAudioText";
import { AudioSink } from "./AudioSink";
import { AudioSystem } from "./AudioSystem";
import { AudioTextChunk } from "./AudioTextChunk";
import { ChunkLoader } from "./ChunkLoader";
import { toModelOptions, TTSErrorInfo } from "./TTSModel";
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
        ? loadCheckLoop(this.system, this.chunkLoader, BUFFER_AHEAD)
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
    const init = JSON.stringify(toModelOptions(this.system.settings));
    return CancellablePromise.from(
      mobx.when(
        () => JSON.stringify(toModelOptions(this.system.settings)) !== init,
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
  const text = chunk.text;

  // 检查文本是否为空或只包含空白字符
  if (!text || !text.trim()) {
    console.warn(`跳过空白音频块 ${position}: "${text}"`);
    // 标记为已加载但没有音频数据
    const silentAudio = createSilentAudio(0.1); // 100ms静音
    chunk.setLoaded(silentAudio);
    return silentAudio;
  }

  // then wait for the next one to complete
  chunk.setLoading();
  let audio: ArrayBuffer;
  try {
    console.log(`开始加载音频块 ${position}: "${text.substring(0, 50)}..."`);
    audio = await chunkLoader.load(text, modelOpts);
    console.log(`成功加载音频块 ${position}, 大小: ${audio.byteLength} bytes`);
  } catch (e) {
    console.error(`音频块 ${position} 加载失败:`, e);
    chunk.setFailed(e);
    
    // 对于可重试的错误，不要抛出异常，而是继续处理下一个块
    if (e instanceof TTSErrorInfo && e.isRetryable) {
      console.warn(`音频块 ${position} 将稍后重试`);
      // 重置块状态以便稍后重试
      setTimeout(() => {
        if (!isCancelled()) {
          chunk.reset();
        }
      }, 2000);
      return undefined;
    }
    
    // 对于不可重试的错误，创建一个静音音频块以保持播放连续性
    console.warn(`为音频块 ${position} 创建静音音频以保持播放连续性`);
    const silentAudio = createSilentAudio(1.0); // 1秒静音
    chunk.setLoaded(silentAudio);
    return silentAudio;
  }

  if (isCancelled()) {
    return;
  } else {
    chunk.setLoaded(audio);
    return audio;
  }
};

// 创建静音音频的辅助函数
function createSilentAudio(durationSeconds: number): ArrayBuffer {
  // 创建一个简单的WAV格式静音音频
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;
  
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;
  
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // 静音数据（全部为0）
  for (let i = 44; i < fileSize; i++) {
    view.setUint8(i, 0);
  }
  
  return buffer;
}

const loadCheckLoop = (
  system: AudioSystem,
  chunkLoader: ChunkLoader,
  maxBufferAhead: number,
): CancellablePromise<void> => {
  let cancelled = false;
  const inner = (): Promise<void> => {
    const position = nextToLoad(system.audioStore.activeText!, maxBufferAhead);
    chunkLoader.expireBefore(system.audioStore.activeText!.position);
    return loadCheck(system, chunkLoader, maxBufferAhead, () => cancelled).then(
      (result) => {
        const activeText = system.audioStore.activeText;
        if (result && activeText && position !== null && !cancelled) {
          activeText.audio.chunks[position].setLoaded(result);
          
          // 检查是否为静音音频（空的ArrayBuffer或很小的音频）
          if (result.byteLength === 0) {
            console.log(`跳过空音频块 ${position} 的媒体添加`);
            // 为空音频块设置默认时长
            const chunk = activeText.audio.chunks[position];
            if (!chunk.duration) {
              chunk.duration = 0.1; // 100ms 默认时长
              chunk.offsetDuration = activeText.audio.chunks
                .slice(0, position)
                .reduce((acc, x) => acc + (x.duration || 0), 0);
            }
            return inner();
          }
          
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
                console.log(`音频块 ${position} 设置完成, 时长: ${buff.duration}s, 偏移: ${offsetDuration}s`);
              } else {
                console.warn(`音频块 ${position} 被中断，重置状态`);
                chunk.reset(); // something interrupted, so reset
              }
            })
            .catch((error) => {
              console.error(`音频块 ${position} 媒体处理失败:`, error);
              // 即使媒体处理失败，也要继续处理下一个块
              const chunk = activeText.audio.chunks[position];
              chunk.setFailed(error);
            })
            .then(() => inner());
        } else {
          // 如果没有结果但还有更多块要加载，继续尝试
          if (position !== null && !cancelled) {
            console.log(`音频块 ${position} 无结果，继续处理下一个`);
            return inner();
          }
          return Promise.resolve();
        }
      },
    ).catch((error) => {
      console.error('loadCheckLoop 出现错误:', error);
      // 即使出现错误，也要继续循环以处理后续块
      if (!cancelled) {
        return new Promise(resolve => setTimeout(resolve, 1000)).then(() => inner());
      }
      return Promise.resolve();
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
