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
import { useEffect, useState, type FC } from "react";
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
        <SimpleStaticPlayer />
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

function attachVisualizationToDom(
  container: HTMLElement,
  audioElement: HTMLAudioElement,
  source: MediaElementAudioSourceNode,
  analyzer: AnalyserNode,
  context: AudioContext,
): {
  destroy: () => void;
} {
  if (context.state === "suspended") {
    context.resume();
  }
  console.log("draw!", {
    contextState: context.state,
    analyzerInputs: analyzer.numberOfInputs,
    analyzerOutputs: analyzer.numberOfOutputs,
    bufferLength: analyzer.frequencyBinCount,
    sourceInputs: source.numberOfInputs,
    sourceOutputs: source.numberOfOutputs,
  });
  const bufferLength = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const nSegments = 8;
  // Create a div and append it to the container

  // Create 8 divs for the bars and append them to the visualizer
  const bars = Array(nSegments)
    .fill(null)
    .map(() => document.createElement("div"));
  bars.forEach((bar) => {
    bar.classList.add("tts-audio-visualizer-bar");
    bar.style.height = "0";
    container.appendChild(bar);
  });

  let frameId: undefined | ReturnType<typeof requestAnimationFrame>;

  // Function to update the bars
  function draw() {
    console.log("draw", context.state);
    frameId = requestAnimationFrame(draw);

    analyzer.getByteFrequencyData(dataArray);

    const min = Math.floor(bufferLength / 32);
    const max = Math.floor(bufferLength / 6) + min;
    const segmentSize = (max - min) / nSegments;

    // Update the height of each bar
    bars.forEach((bar, i) => {
      const index = Math.floor(min + i * segmentSize);
      const index2 = Math.floor(min + i * segmentSize + segmentSize / 2);
      const barHeight1 = dataArray[index] / 255.0; // Scale bar height to fit container
      const barHeight2 = dataArray[index2] / 255.0;
      let barHeight = (barHeight1 + barHeight2) / 2;
      // round the wave form to penalize lowest and highest segments.
      let factor = Math.cos((i * Math.PI * 2) / nSegments) + 1;
      if (i < 2) {
        factor *= 1.5;
      }
      barHeight = Math.pow(barHeight, 1 + factor);
      // convert to percentage
      barHeight *= 100;
      bar.style.height = `${barHeight}%`;
    });
  }

  function resumeAndDraw() {
    stopDrawing();
    draw();
  }
  function stopDrawing() {
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  }

  resumeAndDraw();

  return {
    destroy() {
      stopDrawing();
      for (const bar of bars) {
        container.removeChild(bar);
      }
    },
  };
}

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
