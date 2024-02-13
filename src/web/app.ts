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
  }),
);

const store = loadAudioStore({
  settings: {
    ...DEFAULT_SETTINGS,
    OPENAI_API_KEY: "FIXME",
  },
});
