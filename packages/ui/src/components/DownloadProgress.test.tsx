import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { DownloadProgress } from "./DownloadProgress";

// Mock the IconButton components
vi.mock("./IconButton", () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

describe("DownloadProgress", () => {
  it("should render without crashing", () => {
    render(<DownloadProgress file="test-file.mp3" />);

    expect(screen.getByTestId("spinner")).toBeDefined();
    expect(screen.getByText(/test-file\.mp3/)).toBeDefined();
  });

  it("should display the correct file name", () => {
    const filename = "my-audio.wav";
    render(<DownloadProgress file={filename} />);

    expect(screen.getByText(new RegExp(filename))).toBeDefined();
  });
});
