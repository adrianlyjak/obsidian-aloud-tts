import { setIcon, setTooltip } from "obsidian";
import * as React from "react";
import { CSSProperties } from "react";

/**
 * obsidian uses https://lucide.dev/
 */
export function IconButton({
  icon,
  onClick,
  style,
  tooltip,
  className,
}: {
  icon: string;
  onClick: () => void;
  style?: CSSProperties;
  tooltip?: string;
  className?: string;
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
    <div
      className={(className ? [className] : [])
        .concat(["clickable-icon"])
        .join(" ")}
      style={{ display: "inline-block", lineHeight: "1rem", ...style }}
      ref={(x) => (ref.current = x)}
      onClick={onClick}
    ></div>
  );
}

export function IconSpan({
  icon,
  style,
  className,
}: {
  icon: string;
  style?: CSSProperties;
  className?: string;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, icon);
    }
  }, [ref.current, icon]);
  return (
    <span
      className={className}
      style={{ display: "inline-block", lineHeight: "1rem", ...style }}
      ref={(x) => (ref.current = x)}
    ></span>
  );
}

export function Spinner({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, "loader");
      ref.current.children[0].classList.add("tts-spin");
    }
  }, [ref.current, "loader"]);
  return (
    <span
      style={style}
      className={className}
      ref={(x) => (ref.current = x)}
    ></span>
  );
}
