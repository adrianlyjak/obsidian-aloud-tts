import { TooltipOptions, setIcon, setTooltip } from "obsidian";
import * as React from "react";

/**
 * obsidian uses https://lucide.dev/
 */
export function IconButton({
  icon,
  onClick,
  tooltip,
  className,
  disabled,
}: {
  icon: string;
  onClick: () => void;
  tooltip?: string;
  className?: string;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, icon);
      if (tooltip) {
        setTooltip(ref.current, tooltip);
      }
    }
  }, [ref.current, icon, tooltip]);
  return (
    <button
      className={(className ? [className] : [])
        .concat(["clickable-icon tts-toolbar-button"])
        .join(" ")}
      ref={(x) => (ref.current = x)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      {...(disabled ? { "aria-disabled": "true" } : {})}
    ></button>
  );
}

export function IconSpan({
  icon,
  className,
  tooltip,
  tooltipOptions,
}: {
  icon: string;
  className?: string;
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
      className={["tts-toolbar-icon"]
        .concat(className ? [className] : [])
        .join(" ")}
      ref={(x) => (ref.current = x)}
    ></span>
  );
}

export function Spinner({ className }: { className?: string }) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, "loader");
      ref.current.children[0].classList.add("tts-spin");
    }
  }, [ref.current, "loader"]);
  return <span className={className} ref={(x) => (ref.current = x)}></span>;
}
