import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { IsPlaying } from "./IsPlaying";
import {
  createTestAudioStore,
  createMockObsidianBridge,
  createMockEditorView,
} from "./test-utils";

// Mock the IconButton components
vi.mock("./IconButton", () => ({
  IconSpan: ({ children }: any) => <span>{children}</span>,
}));

describe("IsPlaying", () => {
  it("should render without crashing", () => {
    const mockAudioStore = createTestAudioStore();
    const mockBridge = createMockObsidianBridge();
    const mockEditor = createMockEditorView();

    render(
      <IsPlaying
        audio={mockAudioStore}
        bridge={mockBridge as any}
        editor={mockEditor as any}
      />,
    );

    // Component renders conditionally based on playing state, just verify no crash
    expect(document.body).toBeTruthy();
  });
});
