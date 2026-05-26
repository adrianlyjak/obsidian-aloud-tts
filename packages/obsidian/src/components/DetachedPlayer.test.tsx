import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AudioSink, AudioStore } from "open-tts";
import { DetachedPlayerHost, DetachedPlayerView } from "./DetachedPlayer";
import {
  createMockObsidianBridge,
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
} from "../test-utils";
import { ObsidianBridgeImpl } from "../ObsidianBridge";

function createPlayer({ isPlaying = true } = {}): AudioStore {
  return {
    activeText: {
      isPlaying,
      pause: vi.fn(),
      play: vi.fn(),
      audio: {
        filename: "sample.pdf",
        friendlyName: "sample.pdf: selected text",
      },
    },
    destroy: vi.fn(),
  } as unknown as AudioStore;
}

function createSink(status: AudioSink["trackStatus"] = "playing"): AudioSink {
  return {
    trackStatus: status,
  } as AudioSink;
}

describe("DetachedPlayerView", () => {
  it("does not render when no PDF or detached playback is available", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = createMockObsidianBridge();

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a status bar PDF button before playback starts", async () => {
    const player = { ...createPlayer(), activeText: null } as AudioStore;
    const settings = await createTestSettingsStore();
    const bridge = {
      ...createMockObsidianBridge(),
      canPlayDetachedAudio: true,
    };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    expect(screen.getByLabelText("Play PDF audio")).toBeTruthy();
    expect(screen.getByText("Aloud PDF")).toBeTruthy();
  });

  it("starts PDF playback from the status bar button", async () => {
    const player = { ...createPlayer(), activeText: null } as AudioStore;
    const settings = await createTestSettingsStore();
    const bridge = {
      ...createMockObsidianBridge(),
      canPlayDetachedAudio: true,
    };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    fireEvent.click(screen.getByLabelText("Play PDF audio"));

    expect(bridge.playSelection).toHaveBeenCalled();
  });

  it("renders compact now-playing status once detached playback exists", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    expect(screen.getByText("sample.pdf")).toBeTruthy();
    expect(screen.getByLabelText("Open playback controls")).toBeTruthy();
    expect(screen.queryByLabelText("Pause")).toBeNull();
    expect(screen.queryByLabelText("Stop")).toBeNull();
  });

  it("opens the shared full controls menu from the status item", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    fireEvent.click(screen.getByLabelText("Open playback controls"));

    expect(screen.getByLabelText("Previous")).toBeTruthy();
    expect(screen.getByLabelText("Pause")).toBeTruthy();
    expect(screen.getByLabelText("Next")).toBeTruthy();
    expect(screen.getByLabelText("Playback speed")).toBeTruthy();
    expect(screen.queryByText(/Restart playing/)).toBeNull();
    expect(screen.queryByText(/Auto scroll/)).toBeNull();
  });

  it("keeps interactive status content outside the status button", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    (
      settings as typeof settings & {
        setApiKeyValidity: (valid?: boolean, error?: string) => void;
      }
    ).setApiKeyValidity(false, "Check API key");
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    const statusButton = screen.getByLabelText("Open playback controls");
    const statusLink = screen.getByText("Check API key");

    expect(statusButton.contains(statusLink)).toBe(false);
  });

  it("routes menu pause and stop through the shared playback actions", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    fireEvent.click(screen.getByLabelText("Open playback controls"));
    fireEvent.click(screen.getByLabelText("Pause"));
    fireEvent.click(screen.getByLabelText("Stop"));

    expect(player.activeText?.pause).toHaveBeenCalled();
    expect(player.destroy).toHaveBeenCalled();
  });

  it("closes the full controls menu on outside click", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };

    render(
      <DetachedPlayerView
        player={player}
        settings={settings}
        sink={createSink()}
        bridge={bridge}
      />,
    );

    fireEvent.click(screen.getByLabelText("Open playback controls"));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByLabelText("Previous")).toBeNull();
  });
});

describe("DetachedPlayerHost", () => {
  it("mounts and removes its status bar host", async () => {
    const player = createPlayer();
    const settings = await createTestSettingsStore();
    const bridge = { ...createMockObsidianBridge(), detachedAudio: true };
    const statusBarItem = document.createElement("div");
    document.body.appendChild(statusBarItem);
    const host = new DetachedPlayerHost(
      statusBarItem,
      player,
      settings,
      createSink(),
      bridge,
    );

    expect(await screen.findByLabelText("Open playback controls")).toBeTruthy();

    host.destroy();

    expect(document.body.contains(statusBarItem)).toBe(false);
  });

  it("renders detached controls when playDetached creates active text after host mount", async () => {
    const player = createTestAudioStore();
    const settings = await createTestSettingsStore();
    const bridge = new ObsidianBridgeImpl(
      {
        workspace: {
          on: vi.fn(),
          off: vi.fn(),
          activeLeaf: null,
          getActiveViewOfType: vi.fn(),
        },
      } as any,
      player,
      settings,
    );
    const statusBarItem = document.createElement("div");
    document.body.appendChild(statusBarItem);
    const host = new DetachedPlayerHost(
      statusBarItem,
      player,
      settings,
      new FakeAudioSink(),
      bridge,
    );

    bridge.playDetached("Detached playback lifecycle text.");

    expect(await screen.findByText(/Detached playback/)).toBeTruthy();
    expect(screen.getByLabelText("Open playback controls")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Open playback controls"));

    expect(screen.getByLabelText("Play")).toBeTruthy();
    expect(screen.getByLabelText("Stop")).toBeTruthy();

    host.destroy();
    bridge.destroy();
    player.destroy();
  });
});
