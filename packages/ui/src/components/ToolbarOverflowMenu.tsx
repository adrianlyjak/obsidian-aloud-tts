import * as React from "react";
import { IconButton } from "./IconButton";

export interface ToolbarOverflowMenuItem {
  id: string;
  label: string;
  disabled?: boolean | (() => boolean);
  onSelect: () => void;
}

export function ToolbarOverflowMenu({
  align = "right",
  items,
}: {
  align?: "left" | "right";
  items: ToolbarOverflowMenuItem[];
}): React.ReactNode {
  const [isOpen, setIsOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <span className="tts-toolbar-overflow" ref={rootRef}>
      <IconButton
        icon="more-vertical"
        tooltip="More"
        onClick={() => setIsOpen((open) => !open)}
      />
      {isOpen && (
        <span
          className={`menu tts-toolbar-overflow-menu tts-toolbar-overflow-menu-align-${align}`}
          role="menu"
        >
          {items.map((item) => {
            const disabled = isMenuItemDisabled(item);
            return (
              <button
                type="button"
                className="menu-item tappable tts-toolbar-overflow-menu-item"
                disabled={disabled}
                aria-disabled={disabled}
                role="menuitem"
                key={item.id}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  item.onSelect();
                  setIsOpen(false);
                }}
              >
                <span className="menu-item-title">{item.label}</span>
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

function isMenuItemDisabled(item: ToolbarOverflowMenuItem): boolean {
  return typeof item.disabled === "function"
    ? item.disabled()
    : !!item.disabled;
}
