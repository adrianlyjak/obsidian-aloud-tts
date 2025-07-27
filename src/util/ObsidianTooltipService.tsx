import React from "react";
import { setTooltip, TooltipOptions as ObsidianTooltipOptions } from "obsidian";
import {
  TooltipService,
  TooltipOptions,
  TooltipProvider,
} from "./TooltipContext";

export class ObsidianTooltipService implements TooltipService {
  setTooltip(
    element: HTMLElement,
    text: string,
    options?: TooltipOptions,
  ): void {
    // Convert our generic options to obsidian-specific options
    const obsidianOptions: ObsidianTooltipOptions | undefined = options
      ? {
          delay: options.delay,
          placement: options.placement as any, // Obsidian has stricter placement types
        }
      : undefined;

    setTooltip(element, text, obsidianOptions);
  }
}

export function ObsidianTooltipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider tooltipService={new ObsidianTooltipService()}>
      {children}
    </TooltipProvider>
  );
}
