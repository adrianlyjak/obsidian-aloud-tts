import { TooltipOptions, setIcon, setTooltip } from "obsidian";
import * as React from "react";

/**
 * obsidian uses https://lucide.dev/
 */

export function ObsidianIconSpan({
  icon,
  className,
  style,
  tooltip,
  tooltipOptions,
}: {
  icon: string;
  className?: string;
  style?: React.CSSProperties;
  tooltip?: string;
  tooltipOptions?: TooltipOptions;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, icon);
      if (tooltip) {
        setTooltip(ref.current, tooltip, tooltipOptions);
      }
    }
  }, [ref.current, icon, tooltip]);
  return (
    <span
      style={style}
      className={["tts-toolbar-icon"]
        .concat(className ? [className] : [])
        .join(" ")}
      ref={(x) => (ref.current = x)}
    ></span>
  );
}
