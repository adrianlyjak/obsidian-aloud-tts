import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PlayerView } from "./PlayerView";
import {
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
} from "./test-utils";

vi.mock("./IconButton", () => ({
  IconButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  IconSpan: ({ children }: any) => <span>{children}</span>,
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

vi.mock("./AudioVisualizer", () => ({
  AudioVisualizer: () => (
    <div data-testid="audio-visualizer">Audio Visualizer</div>
  ),
}));

describe("PlayerView", () => {
  it("should render without crashing", async () => {
    const mockAudioStore = createTestAudioStore();
    const mockSettings = await createTestSettingsStore();
    const mockSink = new FakeAudioSink();

    render(
      <PlayerView
        player={mockAudioStore}
        settings={mockSettings}
        sink={mockSink}
        shouldShow={true}
        isMobilePhone={false}
        onOpenSettings={vi.fn()}
        onPlaySelection={vi.fn()}
      />,
    );

    // Component renders conditionally, just verify no crash
    expect(document.body).toBeTruthy();
  });
});
