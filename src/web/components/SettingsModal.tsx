import * as React from "react";
import { useRef, useEffect } from "react";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { AudioStore } from "../../player/AudioStore";
import { IconButton } from "../../components/IconButton";
import { TTSSettingsTabComponent } from "../../components/TTSSettingsTabComponent";

// Theme colors - same as in app.tsx
const THEME = {
  background: {
    primary: "#1e1e1e",
    secondary: "#252526",
    tertiary: "#2d2d30",
  },
  border: {
    primary: "#3e3e42",
    secondary: "#404040",
  },
  text: {
    primary: "#cccccc",
    secondary: "#969696",
    muted: "#6a6a6a",
  },
  accent: {
    primary: "#007acc",
    hover: "#1177bb",
  },
};

export const SettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  settingsStore: TTSPluginSettingsStore;
  audioStore: AudioStore;
}> = ({ isOpen, onClose, settingsStore, audioStore }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Handle modal open/close
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.showModal();
    } else if (!isOpen && dialogRef.current) {
      dialogRef.current.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      style={{
        padding: 0,
        border: "none",
        borderRadius: "8px",
        backgroundColor: THEME.background.secondary,
        color: THEME.text.primary,
        maxWidth: "800px",
        width: "90vw",
        maxHeight: "80vh",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      }}
      onClose={onClose}
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: `1px solid ${THEME.border.primary}`,
          backgroundColor: THEME.background.tertiary,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Settings
        </h2>
        <IconButton icon="x" tooltip="Close Settings" onClick={onClose} />
      </div>

      <div
        style={{
          padding: "20px",
          overflow: "auto",
          maxHeight: "calc(80vh - 60px)",
        }}
      >
        <TTSSettingsTabComponent store={settingsStore} player={audioStore} />
      </div>
    </dialog>
  );
};
