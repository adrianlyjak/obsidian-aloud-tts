import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Spinner } from "./IconButton";

const roots = new WeakMap<HTMLElement, Root>();

export const createDOM = ({ file }: { file: string }) => {
  const container = document.createElement("span");
  const root = createRoot(container);
  roots.set(container, root);
  root.render(<DownloadProgress file={file} />);
  return container;
};

export const destroyDOM = (element: HTMLElement) => {
  const root = roots.get(element);
  if (root) {
    root.unmount();
    roots.delete(element);
  }
};

export const DownloadProgress: React.FC<{ file: string }> = ({ file }) => {
  return (
    <span
      className="tts-download-progress"
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexDirection: "row",
        backgroundColor: "var(--background-secondary)",
        borderRadius: "0.25rem",
        border: "1px solid var(--background-modifier-border)",
        padding: "0.25rem 0.5rem",
      }}
    >
      <Spinner style={{ display: "inline-flex" }} />
      <i style={{ marginLeft: 4 }}>loading {file}</i>
    </span>
  );
};
