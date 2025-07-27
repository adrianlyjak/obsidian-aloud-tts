import { setTooltip, TooltipOptions as ObsidianTooltipOptions } from "obsidian";
import { TooltipService, TooltipOptions } from "./TooltipContext";

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
