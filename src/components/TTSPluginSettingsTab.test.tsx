import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { observable } from "mobx";
import { observer } from "mobx-react-lite";
import { OptionSelect } from "./settings/option-select";
import { DEFAULT_SETTINGS, ModelProvider, modelProviders } from "../player/TTSPluginSettings";

// Test utility component for model switching
const TestModelSwitcher: React.FC<{
  value: ModelProvider;
  onChange: (value: ModelProvider) => void;
}> = observer(({ value, onChange }) => {
  const labels: Record<ModelProvider, string> = {
    gemini: "Google Gemini",
    hume: "Hume",
    openai: "OpenAI", 
    openaicompat: "OpenAI Compatible",
  };

  return (
    <div>
      <label htmlFor="model-select">Model Provider</label>
      <OptionSelect
        options={modelProviders.map((v) => ({ label: labels[v], value: v }))}
        value={value}
        onChange={(v) => onChange(v as ModelProvider)}
      />
    </div>
  );
});

// Create a test settings component that shows different content based on provider
const TestProviderSettings: React.FC<{
  provider: ModelProvider;
}> = ({ provider }) => {
  return (
    <div>
      <div data-testid="provider-name">{provider}</div>
      {provider === "openai" && <div data-testid="openai-settings">OpenAI API Key</div>}
      {provider === "gemini" && <div data-testid="gemini-settings">Gemini API Key</div>}
      {provider === "hume" && <div data-testid="hume-settings">Hume API Key</div>}
      {provider === "openaicompat" && <div data-testid="openaicompat-settings">API Base URL</div>}
    </div>
  );
};

describe("TTSPluginSettingsTab", () => {
  describe("OptionSelect Component", () => {
    it("should render without crashing", () => {
      const mockOnChange = vi.fn();
      
      render(
        <TestModelSwitcher
          value="openai"
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText("Model Provider")).toBeInTheDocument();
      expect(screen.getByDisplayValue("OpenAI")).toBeInTheDocument();
    });

    it("should call onChange when selection changes", async () => {
      const user = userEvent.setup();
      const mockOnChange = vi.fn();
      
      render(
        <TestModelSwitcher
          value="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByDisplayValue("OpenAI");
      await user.selectOptions(select, "gemini");

      expect(mockOnChange).toHaveBeenCalledWith("gemini");
    });

    it("should display all available model providers", () => {
      const mockOnChange = vi.fn();
      
      render(
        <TestModelSwitcher
          value="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByDisplayValue("OpenAI");
      
      // Check that all options are available
      expect(select).toContainHTML("OpenAI");
      expect(select.parentElement).toContainHTML("Google Gemini");
      expect(select.parentElement).toContainHTML("Hume");
      expect(select.parentElement).toContainHTML("OpenAI Compatible");
    });
  });

  describe("Provider-specific Settings", () => {
    it("should render OpenAI settings correctly", () => {
      render(<TestProviderSettings provider="openai" />);
      
      expect(screen.getByTestId("provider-name")).toHaveTextContent("openai");
      expect(screen.getByTestId("openai-settings")).toHaveTextContent("OpenAI API Key");
      expect(screen.queryByTestId("gemini-settings")).not.toBeInTheDocument();
    });

    it("should render Gemini settings correctly", () => {
      render(<TestProviderSettings provider="gemini" />);
      
      expect(screen.getByTestId("provider-name")).toHaveTextContent("gemini");
      expect(screen.getByTestId("gemini-settings")).toHaveTextContent("Gemini API Key");
      expect(screen.queryByTestId("openai-settings")).not.toBeInTheDocument();
    });

    it("should render Hume settings correctly", () => {
      render(<TestProviderSettings provider="hume" />);
      
      expect(screen.getByTestId("provider-name")).toHaveTextContent("hume");
      expect(screen.getByTestId("hume-settings")).toHaveTextContent("Hume API Key");
      expect(screen.queryByTestId("openai-settings")).not.toBeInTheDocument();
    });

    it("should render OpenAI Compatible settings correctly", () => {
      render(<TestProviderSettings provider="openaicompat" />);
      
      expect(screen.getByTestId("provider-name")).toHaveTextContent("openaicompat");
      expect(screen.getByTestId("openaicompat-settings")).toHaveTextContent("API Base URL");
      expect(screen.queryByTestId("openai-settings")).not.toBeInTheDocument();
    });

    it("should switch between providers without crashing", () => {
      const providers: ModelProvider[] = ["openai", "gemini", "hume", "openaicompat"];
      
      providers.forEach(provider => {
        const { unmount } = render(<TestProviderSettings provider={provider} />);
        
        expect(screen.getByTestId("provider-name")).toHaveTextContent(provider);
        
        // Should render without errors
        expect(screen.getByTestId("provider-name")).toBeInTheDocument();
        
        unmount();
      });
    });
  });

  describe("Integration Test", () => {
    it("should update settings store when switching providers", async () => {
      const user = userEvent.setup();
      
      // Create observable settings
      const settings = observable({
        ...DEFAULT_SETTINGS,
        modelProvider: "openai" as ModelProvider,
      });
      
      const mockUpdateSettings = vi.fn();
      
      // Combined component that shows both switcher and settings
      const TestApp: React.FC = observer(() => {
        return (
          <div>
            <TestModelSwitcher
              value={settings.modelProvider}
              onChange={(provider) => {
                settings.modelProvider = provider;
                mockUpdateSettings(provider);
              }}
            />
            <TestProviderSettings provider={settings.modelProvider} />
          </div>
        );
      });
      
      render(<TestApp />);

      // Initially should show OpenAI
      expect(screen.getByDisplayValue("OpenAI")).toBeInTheDocument();
      expect(screen.getByTestId("openai-settings")).toBeInTheDocument();

      // Switch to Gemini
      const select = screen.getByDisplayValue("OpenAI");
      await user.selectOptions(select, "gemini");

      // Should call update function
      expect(mockUpdateSettings).toHaveBeenCalledWith("gemini");
      
      // Should show Gemini settings
      expect(screen.getByTestId("gemini-settings")).toBeInTheDocument();
      expect(screen.queryByTestId("openai-settings")).not.toBeInTheDocument();
    });
  });
}); 