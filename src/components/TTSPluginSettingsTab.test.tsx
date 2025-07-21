import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { TTSSettingsTabComponent } from "./TTSSettingsTabComponent";
import { AudioStore } from "../player/AudioStore";
import {
  TTSPluginSettingsStore,
  modelProviders,
} from "../player/TTSPluginSettings";
import { createTestAudioStore, createTestSettingsStore } from "./test-utils";

// Mock components that have obsidian dependencies
vi.mock("./IconButton", () => ({
  IconButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  IconSpan: ({ children }: any) => <span>{children}</span>,
  Spinner: () => <div>Loading...</div>,
}));

vi.mock("./PlayerView", () => ({
  TTSErrorInfoView: () => <div>Error View</div>,
  TTSErrorInfoDetails: () => <div>Error Details</div>,
}));

// Helper to create test stores
async function createTestStores() {
  const audioStore = createTestAudioStore();
  const settingsStore = await createTestSettingsStore();
  return { audioStore, settingsStore };
}

describe("TTSPluginSettingsTab", () => {
  let stores: { audioStore: AudioStore; settingsStore: TTSPluginSettingsStore };

  beforeEach(async () => {
    stores = await createTestStores();
  });

  it("should render settings and switch between all providers", async () => {
    const user = userEvent.setup();

    render(
      <TTSSettingsTabComponent
        store={stores.settingsStore}
        player={stores.audioStore}
      />,
    );

    // Should render main elements
    expect(screen.getByText("Aloud")).toBeDefined();
    expect(screen.getByText("Model Provider")).toBeDefined();
    expect(screen.getByRole("button", { name: /test voice/i })).toBeDefined();

    // Test switching between all providers
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects[0]; // First select should be the provider dropdown

    for (const provider of modelProviders) {
      // Select the provider option
      await user.selectOptions(providerSelect, provider);

      // Verify the settings store was updated
      expect(stores.settingsStore.settings.modelProvider).toBe(provider);

      // Just verify the component rendered without crashing for this provider
      expect(screen.getByText("Model Provider")).toBeDefined();
    }
  });
});
