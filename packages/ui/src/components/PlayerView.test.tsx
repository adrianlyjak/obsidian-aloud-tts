import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import React from "react";
import { PlayerView } from "./PlayerView";
import type { PlayerViewProps } from "./PlayerView";
import {
  createTestAudioStore,
  createTestSettingsStore,
  FakeAudioSink,
} from "./test-utils";

type MockIconButtonProps = {
  icon: string;
  onClick: () => void;
  tooltip?: string;
  disabled?: boolean;
  highlight?: boolean;
};

vi.mock("./IconButton", () => ({
  IconButton: ({
    icon,
    onClick,
    tooltip,
    disabled,
    highlight,
  }: MockIconButtonProps) => (
    <button
      type="button"
      aria-label={tooltip ?? icon}
      data-icon={icon}
      data-highlight={highlight ? "true" : "false"}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {tooltip ?? icon}
    </button>
  ),
  IconSpan: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

vi.mock("./AudioVisualizer", () => ({
  AudioVisualizer: () => (
    <div data-testid="audio-visualizer">Audio Visualizer</div>
  ),
}));

async function renderPlayerView(
  overrides: Partial<PlayerViewProps> = {},
): Promise<{
  player: PlayerViewProps["player"];
  settings: PlayerViewProps["settings"];
  sink: PlayerViewProps["sink"];
}> {
  const player = overrides.player ?? createTestAudioStore();
  const settings = overrides.settings ?? (await createTestSettingsStore());
  const sink = overrides.sink ?? new FakeAudioSink();
  const props: PlayerViewProps = {
    player,
    settings,
    sink,
    shouldShow: true,
    isMobilePhone: false,
    onOpenSettings: vi.fn(),
    onPlaySelection: vi.fn(),
    ...overrides,
  };

  render(<PlayerView {...props} />);

  return { player, settings, sink };
}

describe("PlayerView", () => {
  it("should render without crashing", async () => {
    await renderPlayerView();

    expect(document.body).toBeTruthy();
  });

  it("keeps document export out of the permanent toolbar", async () => {
    await renderPlayerView({
      onSaveDocumentAudio: vi.fn(),
    });

    expect(
      screen.queryByRole("button", { name: "Save document as audio..." }),
    ).toBeNull();
    expect(document.querySelector('[data-icon="download"]')).toBeNull();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("opens an overflow menu with export actions", async () => {
    const exportSelection = vi.fn();
    const saveDocument = vi.fn();
    await renderPlayerView({
      onExportSelectionAudio: exportSelection,
      canExportSelectionAudio: true,
      onSaveDocumentAudio: saveDocument,
    });

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Export selection as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole("menuitem", {
          name: "Save document as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Save document as audio..." }),
    );

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("disables selection export when there is no selection", async () => {
    await renderPlayerView({
      onExportSelectionAudio: vi.fn(),
      canExportSelectionAudio: false,
      onSaveDocumentAudio: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Export selection as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("disables document export while export is running", async () => {
    const player = createTestAudioStore();
    runInAction(() => {
      player.exportProgress = { completed: 0, total: 1 };
    });

    await renderPlayerView({
      player,
      onSaveDocumentAudio: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Save document as audio...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows export progress and a cancel button even when the player is hidden", async () => {
    const player = createTestAudioStore();
    const cancelExport = vi.spyOn(player, "cancelExport");
    runInAction(() => {
      player.exportProgress = { completed: 0, total: 1 };
    });

    await renderPlayerView({
      player,
      shouldShow: false,
    });

    expect(screen.getByText("Saving document audio...")).toBeTruthy();
    expect(screen.queryByText(/chunks/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Play selection" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });

    fireEvent.click(cancelButton);

    expect(cancelExport).toHaveBeenCalledTimes(1);
  });

  it("shows section progress without exposing chunks", async () => {
    const player = createTestAudioStore();
    runInAction(() => {
      player.exportProgress = { completed: 0, total: 3 };
    });

    await renderPlayerView({
      player,
    });

    expect(screen.getByText("Saving document audio... 1 of 3")).toBeTruthy();
    expect(screen.queryByText(/chunks/)).toBeNull();
  });
});
