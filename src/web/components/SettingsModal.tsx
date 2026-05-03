import * as React from "react";
import { useRef, useEffect } from "react";
import { TTSPluginSettingsStore } from "../../player/TTSPluginSettings";
import { AudioStore } from "../../player/AudioStore";
import { IconButton } from "../../components/IconButton";
import { TTSSettingsTabComponent } from "../../components/TTSSettingsTabComponent";
import { PollyAuthSettingsStore } from "../../player/PollyAuthSettings";
import { RuntimeServices } from "../../player/RuntimeServices";

export const SettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  settingsStore: TTSPluginSettingsStore;
  audioStore: AudioStore;
  pollyAuthSettings: PollyAuthSettingsStore;
  runtime: RuntimeServices;
}> = ({
  isOpen,
  onClose,
  settingsStore,
  audioStore,
  pollyAuthSettings,
  runtime,
}) => {
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
      className="web-tts-settings-modal"
      onClose={onClose}
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="web-tts-settings-modal-header">
        <h2 className="web-tts-settings-modal-title">Settings</h2>
        <IconButton icon="x" tooltip="Close Settings" onClick={onClose} />
      </div>

      <div className="web-tts-settings-modal-content">
        <TTSSettingsTabComponent
          store={settingsStore}
          player={audioStore}
          pollyAuthSettings={pollyAuthSettings}
          runtime={runtime}
        />
      </div>
    </dialog>
  );
};
