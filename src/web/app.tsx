import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "../player/Player";
import {
  pluginSettingsStore,
  REAL_OPENAI_API_URL,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";
import { openAITextToSpeech } from "../player/TTSModel";
import { WebAudioSink } from "../player/AudioSink";
import * as React from "react";
import FFT from "fft.js";

import { useEffect, useState, type FC, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  attachVisualizationToDom,
  AudioVisualizer,
} from "../components/AudioVisualizer";

/**
 *
 * This could be more full featured, but right now its just an easy way to pin
 * down safari/chrome differences by running ad hoc things in the browesr
 *
 */
async function main() {
  const settingsStore = await pluginSettingsStore(
    async () => {
      const loaded = localStorage.getItem("settings");
      return loaded ? JSON.parse(loaded) : undefined;
    },
    async (data) => {
      localStorage.setItem("settings", JSON.stringify(data));
    },
  );

  const audioSink = await WebAudioSink.create();
  const store = loadAudioStore({
    settings: settingsStore.settings,
    storage: new IndexedDBAudioStorage(),
    audioSink,
  });

  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  const reactRoot = createRoot(root);
  reactRoot.render(
    <Container settingsStore={settingsStore} store={store} sink={audioSink} />,
  );
}

const Container: FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
  sink: WebAudioSink;
}> = ({ settingsStore, store, sink }) => {
  return (
    <div
      className="backdrop"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <div
        className="container"
        style={{ maxWidth: "600px", padding: "3rem 1rem" }}
      >
        <Settings settingsStore={settingsStore} />
        <hr />
        {/* <SimplePlayer settingsStore={settingsStore} />
        <hr /> */}
        {/* <SimpleStaticPlayer /> */}
        <CustomAudioAnalyzer />
        <hr />
        <Player store={store} sink={sink} />
      </div>
    </div>
  );
};

const Settings: React.FC<{ settingsStore: TTSPluginSettingsStore }> = observer(
  ({ settingsStore }) => {
    return (
      <>
        <h2>Settings</h2>
        <div>
          <label>
            <label htmlFor="openai_apiKey">OpenAI API Key</label>
            <input
              id="openai_apiKey"
              type="text"
              value={settingsStore.settings.openai_apiKey}
              onChange={(e) => {
                settingsStore.updateModelSpecificSettings("openai", {
                  openai_apiKey: e.target.value,
                });
              }}
            />
          </label>
        </div>
      </>
    );
  },
);

const SimpleStaticPlayer = () => {
  const [audio, setAudio] = React.useState<
    | {
        audio: HTMLAudioElement;
        context: AudioContext;
        analyser: AnalyserNode;
        source: MediaElementAudioSourceNode;
      }
    | undefined
  >(undefined);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const play = React.useCallback(() => {
    const audio = new Audio();
    const ms = new MediaSource();
    audio.src = URL.createObjectURL(ms);
    audio.play();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaElementSource(audio);

    source.connect(analyser);
    analyser.connect(context.destination);
    context.resume();
    setAudio({ audio, context, analyser, source });
    ms.addEventListener(
      "sourceopen",
      () => {
        const source = ms.addSourceBuffer("audio/mpeg");

        fetch("speech.mp3")
          .then((r) => r.arrayBuffer())
          .then((blob) => {
            source.appendBuffer(blob);
          });
      },
      { once: true },
    );
  }, []);
  React.useEffect(() => {
    if (ref.current && audio) {
      attachVisualizationToDom(
        ref.current,
        audio.audio,
        audio.source,
        audio.analyser,
        audio.context,
      );
    }
  }, [ref.current, audio]);
  return (
    <>
      <button onClick={play}>Play</button>
      <div className="tts-audio-visualizer" ref={(x) => (ref.current = x)} />
    </>
  );
};

const CustomAudioAnalyzer = () => {
  const [audio, setAudio] = useState<HTMLAudioElement | undefined>(undefined);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | undefined>(
    undefined,
  );
  const [fft, setFFT] = useState<FFT | undefined>(undefined);
  const rafId = useRef<number | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);

  const fftSize = 8;
  const analysisSize = fftSize / 2;
  const play = useCallback(async () => {
    console.log("Play button clicked");

    // Create and set up the audio element
    const audioElement = new Audio();
    const ms = new MediaSource();
    audioElement.src = URL.createObjectURL(ms);
    audioElement.play();

    await new Promise((r) =>
      ms.addEventListener("sourceopen", r, { once: true }),
    );

    const source = ms.addSourceBuffer("audio/mpeg");

    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    // Fetch and decode the audio data
    const response = await fetch("speech.mp3");
    const arrayBuffer = await response.arrayBuffer();
    source.appendBuffer(arrayBuffer);
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
    setAudioBuffer(decodedBuffer);

    setAudio(audioElement);

    // Create FFT instance
    const fftInstance = new FFT(fftSize);
    setFFT(fftInstance);
  }, []);

  const getByteFrequencyData = useCallback(
    (audioBuffer: AudioBuffer, position: number) => {
      if (!fft) return new Uint8Array(analysisSize);

      const channels = [];
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
      }

      const mono = channels[0].subarray(position, position + fftSize);
      const spectrum = fft.createComplexArray();
      fft.realTransform(spectrum, mono);

      // Convert to magnitude
      const magnitudes = new Float32Array(analysisSize);
      for (let i = 0; i < analysisSize; i++) {
        const real = spectrum[i * 2];
        const imag = spectrum[i * 2 + 1];
        magnitudes[i] = Math.sqrt(real * real + imag * imag);
      }

      // Convert to byte frequency data (0-255)
      const byteFrequencyData = new Uint8Array(analysisSize);
      for (let i = 0; i < analysisSize; i++) {
        byteFrequencyData[i] = Math.min(
          255,
          Math.max(0, Math.floor(magnitudes[i] * 255)),
        );
      }

      return byteFrequencyData;
    },
    [fft],
  );

  const updateVisualization = useCallback(() => {
    if (!audio || !audioBuffer || !fft) return;

    const currentTime = audio.currentTime;
    const sampleRate = audioBuffer.sampleRate;
    const position = Math.floor(currentTime * sampleRate);

    const frequencyData = getByteFrequencyData(audioBuffer, position);

    // Update visualization (simplified for this example)
    if (visualizerRef.current) {
      const canvas = visualizerRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / frequencyData.length;
        for (let i = 0; i < frequencyData.length; i++) {
          const barHeight = (frequencyData[i] / 255) * canvas.height;
          ctx.fillStyle = `rgb(${frequencyData[i]}, 50, 50)`;
          ctx.fillRect(
            i * barWidth,
            canvas.height - barHeight,
            barWidth,
            barHeight,
          );
        }
      }
    }

    rafId.current = requestAnimationFrame(updateVisualization);
  }, [audio, audioBuffer, fft, getByteFrequencyData]);

  useEffect(() => {
    if (audio && audioBuffer && fft) {
      updateVisualization();
    }
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [audio, audioBuffer, fft, updateVisualization]);

  return (
    <>
      <button onClick={play}>Play</button>
      <canvas
        ref={(x) => (visualizerRef.current = x)}
        width="800"
        height="200"
      />
    </>
  );
};

const SimplePlayer: FC<{ settingsStore: TTSPluginSettingsStore }> = observer(
  ({ settingsStore }) => {
    const [sink, setSink] = useState<WebAudioSink | undefined>(undefined);
    useEffect(() => {
      WebAudioSink.create().then(async (sink) => {
        const text = `Speaking of connections, I think that's another important aspect of embracing uncertainty. When we're open to new experiences and perspectives, we're more likely to form meaningful connections with others. We're more likely to listen, to learn, and to grow together.`;
        const audio = await openAITextToSpeech(text, {
          apiKey: settingsStore.settings.openai_apiKey,
          model: "tts-1",
          voice: "shimmer",
          playbackSpeed: 1,
          apiUri: REAL_OPENAI_API_URL,
        });
        await sink.setMedia(audio);
        setSink(sink);
      });
    }, []);
    async function loadText() {
      sink?.play();
    }
    const hasmms = !!window.ManagedMediaSource;
    const hasmse = !!window.MediaSource;
    const isSupported = hasmms
      ? window.ManagedMediaSource?.isTypeSupported("audio/mpeg")
      : hasmse
        ? MediaSource.isTypeSupported("audio/mpeg")
        : false;
    return (
      <div>
        Hi World
        <a
          key="clickme"
          style={{ cursor: "pointer", display: "block" }}
          onClick={loadText}
        >
          Load Text
        </a>
        {sink && <AudioVisualizer audioElement={sink._audio} />}
        <div>Has MMS: {hasmms ? "YES" : "NO"}</div>
        <div>Has MSE: {hasmse ? "YES" : "NO"}</div>
        <div>
          <strong>audio/mpeg</strong> is{" "}
          {isSupported ? "SUPPORTED" : "NOT SUPPORTED"}
        </div>
      </div>
    );
  },
);

const Player: React.FC<{ store: AudioStore; sink: WebAudioSink }> = observer(
  ({ store, sink }) => {
    const [playing, setPlaying] = useState(false);
    const [active, setActive] = useState(false);
    return (
      <div>
        <a
          key="clickme"
          style={{ cursor: "pointer", display: "block" }}
          onClick={() => {
            const text = `Twas brillig, and the slithy toves
Did gyre and gimble in the wabe:
All mimsy were the borogoves,
And the mome raths outgrabe.

Beware the Jabberwock, my son!
The jaws that bite, the claws that catch!
Beware the Jubjub bird, and shun
The frumious Bandersnatch!`;
            setPlaying(true);
            store.startPlayer({
              filename: "test.md",
              text,
              start: 0,
              end: text.length,
            });
          }}
        >
          Load Text
        </a>
        <a
          key="clickme2"
          style={{ cursor: "pointer", display: "block" }}
          onClick={() => store.activeText!.pause()}
        >
          Pause
        </a>

        <a
          key="clickme3"
          style={{ cursor: "pointer", display: "block" }}
          onClick={() => store.activeText!.play()}
        >
          Play
        </a>
        {playing &&
          (active ? (
            <AudioVisualizer audioElement={sink._audio} />
          ) : (
            <a onClick={() => setActive(true)}>Activate Visual</a>
          ))}
      </div>
    );
  },
);

main().catch(console.error);
