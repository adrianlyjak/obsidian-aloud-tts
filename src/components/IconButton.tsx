import * as React from "react";
import { LucideIcon } from "lucide-react";
import * as Icons from "lucide-react";
import { useTooltip, TooltipOptions } from "../util/TooltipContext";

// Map common icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  check: Icons.Check,
  "alert-circle": Icons.AlertCircle,
  loader: Icons.Loader2,
  play: Icons.Play,
  pause: Icons.Pause,
  stop: Icons.Square,
  "skip-forward": Icons.SkipForward,
  "skip-back": Icons.SkipBack,
  settings: Icons.Settings,
  "help-circle": Icons.HelpCircle,
  eye: Icons.Eye,
  "eye-off": Icons.EyeOff,
  "refresh-ccw": Icons.RefreshCcw,
  trash: Icons.Trash2,
  download: Icons.Download,
  "external-link": Icons.ExternalLink,
  x: Icons.X,
  "step-forward": Icons.StepForward,
};

/**
 * IconButton using lucide-react icons with obsidian-compatible tooltips
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
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const IconComponent = iconMap[icon] || Icons.Circle;
  const tooltipService = useTooltip();

  React.useEffect(() => {
    if (ref.current && tooltip) {
      tooltipService.setTooltip(ref.current, tooltip);
    }
  }, [tooltip, tooltipService]);

  return (
    <button
      className={(className ? [className] : [])
        .concat(["clickable-icon tts-toolbar-button"])
        .join(" ")}
      ref={ref}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "4px",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      {...(disabled ? { "aria-disabled": "true" } : {})}
    >
      <IconComponent size={16} className={disabled ? "opacity-50" : ""} />
    </button>
  );
}

export function IconSpan({
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
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const IconComponent = iconMap[icon] || Icons.Circle;
  const tooltipService = useTooltip();

  React.useEffect(() => {
    if (ref.current && tooltip) {
      tooltipService.setTooltip(ref.current, tooltip, tooltipOptions);
    }
  }, [tooltip, tooltipOptions, tooltipService]);

  return (
    <span className={className} style={style} ref={ref}>
      <IconComponent size={16} />
    </span>
  );
}

export function Spinner({
  className,
  style,
  delay = 0,
}: {
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}) {
  const [visible, setVisible] = React.useState(delay === 0);

  React.useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [delay]);

  return (
    <span
      className={`${className || ""} fade-in ${visible ? "visible" : ""}`}
      style={style}
    >
      <Icons.Loader2 size={16} className="tts-spin" />
    </span>
  );
}
