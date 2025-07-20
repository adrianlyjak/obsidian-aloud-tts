import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { AudioVisualizer } from "./AudioVisualizer";
import { createMockAudioElement, createMockAudioBuffer } from "./test-utils";

describe("AudioVisualizer", () => {
  it("should render without crashing", () => {
    const mockAudioElement = createMockAudioElement();
    const mockAudioBuffer = createMockAudioBuffer();

    render(
      <AudioVisualizer
        audioElement={mockAudioElement as any}
        audioBuffer={mockAudioBuffer as any}
        offsetDurationSeconds={0}
      />
    );
    
    // Component may render conditionally based on refs, just verify no crash
    expect(document.body).toBeTruthy();
  });
}); 