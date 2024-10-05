import * as React from "react";
import { createRoot } from "react-dom/client";
import { AudioStore, loadAudioStore } from "../player/Player";
import {
  pluginSettingsStore,
  TTSPluginSettingsStore,
} from "../player/TTSPluginSettings";
import { observer } from "mobx-react-lite";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";

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

  const store = loadAudioStore({
    settings: settingsStore.settings,
    storage: new IndexedDBAudioStorage(),
  });

  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  const reactRoot = createRoot(root);
  reactRoot.render(<Container settingsStore={settingsStore} store={store} />);
}

const Container: React.FC<{
  settingsStore: TTSPluginSettingsStore;
  store: AudioStore;
}> = ({ settingsStore, store }) => {
  return (
    <>
      <Settings settingsStore={settingsStore} />
      <Player store={store} />
    </>
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

const Player: React.FC<{ store: AudioStore }> = observer(({ store }) => {
  return (
    <div>
      <a
        key="clickme"
        style={{ cursor: "pointer", display: "block" }}
        onClick={() => {
          const text = `Speaking of connections, I think that's another important aspect of embracing uncertainty. When we're open to new experiences and perspectives, we're more likely to form meaningful connections with others. We're more likely to listen, to learn, and to grow together.`;
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
    </div>
  );
});

main().catch(console.error);
