import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AudioStore, TTSActions } from "open-tts";
import { PlaybackTransportControls } from "./PlayerView";
import { FakeAudioSink } from "./test-utils";

function createActions(): TTSActions {
  return {
    playSelection: vi.fn(),
    playPause: vi.fn(),
    stop: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    speedUp: vi.fn(),
    speedDown: vi.fn(),
    canSpeedUp: vi.fn(() => true),
    canSpeedDown: vi.fn(() => true),
    toggleAutoscroll: vi.fn(),
    isPlaying: vi.fn(() => true),
    isPaused: vi.fn(() => false),
    hasActiveText: vi.fn(() => true),
    currentSpeed: vi.fn(() => 1),
    autoscrollEnabled: vi.fn(() => false),
  };
}

function createPlayer(activeText: unknown = {}): AudioStore {
  return {
    activeText,
  } as unknown as AudioStore;
}

describe("PlaybackTransportControls", () => {
  it("routes transport clicks through the supplied action object", () => {
    const actions = createActions();
    const player = createPlayer();
    const sink = new FakeAudioSink();
    sink.play();

    render(
      <PlaybackTransportControls
        actions={actions}
        player={player}
        sink={sink}
        showPreviousNext
      />,
    );

    fireEvent.click(screen.getByLabelText("Pause"));
    fireEvent.click(screen.getByLabelText("Previous"));
    fireEvent.click(screen.getByLabelText("Next"));
    fireEvent.click(screen.getByLabelText("Cancel playback"));

    expect(actions.playPause).toHaveBeenCalledOnce();
    expect(actions.previous).toHaveBeenCalledOnce();
    expect(actions.next).toHaveBeenCalledOnce();
    expect(actions.stop).toHaveBeenCalledOnce();
  });

  it("can omit previous and next for compact detached surfaces", () => {
    const actions = createActions();
    const player = createPlayer();
    const sink = new FakeAudioSink();

    render(
      <PlaybackTransportControls
        actions={actions}
        player={player}
        sink={sink}
        showPreviousNext={false}
      />,
    );

    expect(screen.queryByLabelText("Previous")).toBeNull();
    expect(screen.queryByLabelText("Next")).toBeNull();
    expect(screen.getByLabelText("Resume")).toBeTruthy();
    expect(screen.getByLabelText("Cancel playback")).toBeTruthy();
  });
});
