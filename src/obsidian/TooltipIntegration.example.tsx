// Example: How to use TooltipProvider in Obsidian components
import * as React from "react";
import { TooltipProvider } from "../util/TooltipContext";
import { ObsidianTooltipService } from "../util/ObsidianTooltipService";
import { TTSSettingsTabComponent } from "../components/TTSSettingsTabComponent";

// In your Obsidian plugin, wrap components with TooltipProvider
export function renderObsidianComponent(settingsStore: any, player: any) {
  const obsidianTooltipService = new ObsidianTooltipService();

  return (
    <TooltipProvider tooltipService={obsidianTooltipService}>
      <TTSSettingsTabComponent store={settingsStore} player={player} />
    </TooltipProvider>
  );
}

// For other Obsidian components that need tooltips:
// - Wrap them in TooltipProvider with ObsidianTooltipService
// - Components like IconButton will automatically get rich Obsidian tooltips
// - In web, they'll fall back to simple title attributes
