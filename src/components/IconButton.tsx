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

export function Spinner({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(delay === 0);

  React.useLayoutEffect(() => {
    if (ref.current) {
      setIcon(ref.current, "loader");
      ref.current.children[0].classList.add("tts-spin");
    }
    if (delay > 0) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [ref.current]);

  return (
    <span
      className={`${className} fade-in ${visible ? "visible" : ""}`}
      ref={(x) => (ref.current = x)}
    ></span>
  );
}
