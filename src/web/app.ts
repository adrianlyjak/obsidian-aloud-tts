import * as React from "react";
import { createRoot } from "react-dom/client";
import { loadAudioStore } from "../player/Player";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

/**
 *
 *
 *
 *
 * This could be more full featured, but right now its just an easy way to pin
 * down safari/chrome differences by running ad hoc things in the browesr
 *
 */

// async function fnetch(): Promise<void> {
//   try {
//     const audio = document.createElement("audio") as HTMLAudioElement; // new Audio();

//     audio.disableRemotePlayback = true;
//     // audio.controls = true;

//     const mediaSource =
//       "ManagedMediaSource" in window
//         ? new ManagedMediaSource()
//         : (new MediaSource() as MediaSource);
//     console.log("mediaSource");
//     audio.src = URL.createObjectURL(mediaSource);
//     console.log("src", audio.src);
//     document.body.appendChild(audio);
//     const eventuallyEvent: Promise<Event> = new Promise((res) =>
//       mediaSource.addEventListener("sourceopen", res, { once: true })
//     );
//     audio.play();
//     const e = await eventuallyEvent;
//     console.log("opened");
//     URL.revokeObjectURL(audio.src);
//     const mime = "audio/mpeg";
//     const mediaSourceTarget = e.target! as MediaSource;
//     console.log("target", mediaSourceTarget);
//     const sourceBuffer = mediaSourceTarget.addSourceBuffer(mime);
//     sourceBuffer.addEventListener("updatestart", () =>
//       console.log("updatestart")
//     );
//     sourceBuffer.addEventListener("update", () => console.log("update"));
//     sourceBuffer.addEventListener("updateend", () => console.log("updateend"));
//     sourceBuffer.addEventListener("abort", () => console.log("abort"));
//     sourceBuffer.addEventListener("error", () => console.log("error"));
//     audio.addEventListener("stalled", () => console.log("stalled"));
//     audio.addEventListener("ended", () => console.log("ended"));
//     audio.addEventListener("canplay", () => console.log("canplay"));
//     audio.addEventListener("canplaythrough", () =>
//       console.log("canplaythrough")
//     );
//     audio.addEventListener("emptied", () => console.log("emptied"));
//     audio.addEventListener("pause", () => console.log("pause"));
//     audio.addEventListener("play", () => console.log("play"));
//     audio.addEventListener("playing", () => console.log("playing"));
//     audio.addEventListener("progress", () => console.log("progress"));
//     audio.addEventListener("ratechange", () => console.log("ratechange"));
//     audio.addEventListener("seeked", () => console.log("seeked"));
//     audio.addEventListener("seeking", () => console.log("seeking"));
//     audio.addEventListener("suspend", () => console.log("suspend"));
//     audio.addEventListener("timeupdate", (e) => console.log("timeupdate", e));
//     audio.addEventListener("volumechange", () => console.log("volumechange"));

//     console.log("sb", sourceBuffer);
//     const fileHeaders = await fetch("./test.mp3");
//     const buff = await fileHeaders.arrayBuffer();
//     sourceBuffer.appendBuffer(buff);
//   } catch (ex) {
//     console.error(ex);
//   }
// }

// function arrayBufferToAudioSrc(arrayBuffer: ArrayBuffer): string {
//   const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
//   const audioSrc = URL.createObjectURL(blob);
//   return audioSrc;
// }

const root = document.createElement("div");
root.id = "root";
document.body.appendChild(root);
const reactRoot = createRoot(root);
reactRoot.render(
  React.createElement("div", {
    children: [
      React.createElement("a", {
        key: "clickme",
        style: { cursor: "pointer", display: "block" },
        children: "Click Me",
        onClick: () => {
          // fnetch();
          store.startPlayer({
            filename: "test.md",
            text: "A long time ago, in a galaxy far far away. Luke skywalker is a jedi",
          });
        },
      }),
      React.createElement("a", {
        key: "clickme2",
        style: { cursor: "pointer", display: "block" },
        children: "Pause",
        onClick: () => store.activeText!.pause(),
      }),
      React.createElement("a", {
        key: "clickme3",
        style: { cursor: "pointer", display: "block" },
        children: "Play",
        onClick: () => store.activeText!.play(),
      }),
    ],
  })
);

const store = loadAudioStore({
  settings: {
    ...DEFAULT_SETTINGS,
    OPENAI_API_KEY: "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",
  },
});
