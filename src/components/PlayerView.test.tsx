import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PlayerView } from "./PlayerView";
import { 
  createTestAudioStore, 
  createTestSettingsStore, 
  FakeAudioSink, 
  createMockObsidianBridge, 
  createMockEditorView 
} from "./test-utils";

// Mock dependencies
vi.mock("obsidian", () => ({
  setTooltip: vi.fn(),
  isMobile: vi.fn(() => false),
}));

vi.mock("./IconButton", () => ({
  IconButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  IconSpan: ({ children }: any) => <span>{children}</span>,
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

vi.mock("./AudioVisualizer", () => ({
  AudioVisualizer: () => <div data-testid="audio-visualizer">Audio Visualizer</div>,
}));

describe("PlayerView", () => {
  it("should render without crashing", async () => {
    const mockAudioStore = createTestAudioStore();
    const mockSettings = await createTestSettingsStore();
    const mockSink = new FakeAudioSink();
    const mockBridge = createMockObsidianBridge();
    const mockEditor = createMockEditorView();

    render(
      <PlayerView
        editor={mockEditor as any}
        player={mockAudioStore}
        settings={mockSettings}
        sink={mockSink}
        obsidian={mockBridge as any}
      />
    );
    
    // Component renders conditionally, just verify no crash
    expect(document.body).toBeTruthy();
  });
}); 