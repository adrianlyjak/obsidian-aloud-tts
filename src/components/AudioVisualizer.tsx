import * as React from "react";
import { AudioState } from "../player/AudioSink";

export const AudioAnalyzer: React.FC<{
  audio: AudioState;
  style?: React.CSSProperties;
}> = ({ audio, style }) => {
  const ref = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (ref.current) {
      const destroyer = AudioVisualizer(ref.current, audio);
      // setAudioMotion(newAudioMotion);
      return destroyer.destroy;
    }
  }, [!!ref.current, audio]);
  return (
    <div
      id="audio-visualizer"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: "2rem",
        ...style,
      }}
      ref={(x) => (ref.current = x)}
    ></div>
  );
};

function AudioVisualizer(
  container: HTMLElement,
  { audio, analyzer }: AudioState
): {
  destroy: () => void;
} {
  const bufferLength = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const nSegments = 8;
  // Create a div and append it to the container

  // Create 8 divs for the bars and append them to the visualizer
  const bars = Array(nSegments)
    .fill(null)
    .map(() => document.createElement("div"));
  bars.forEach((bar) => {
    bar.style.backgroundColor = "var(--icon-color)";
    bar.style.borderRadius = "10px";
    bar.style.width = "6%";
    bar.style.height = "0";
    container.appendChild(bar);
  });

  let frameId: undefined | ReturnType<typeof requestAnimationFrame>;

  // Function to update the bars
  function draw() {
    frameId = requestAnimationFrame(draw);

    analyzer.getByteFrequencyData(dataArray);

    const min = Math.floor(bufferLength / 32);
    const max = Math.floor(bufferLength / 6) + min;
    const segmentSize = (max - min) / nSegments;

    // Update the height of each bar
    bars.forEach((bar, i) => {
      const index = Math.floor(min + i * segmentSize);
      const index2 = Math.floor(min + i * segmentSize + segmentSize / 2);
      const barHeight1 = dataArray[index] / 255.0; // Scale bar height to fit container
      const barHeight2 = dataArray[index2] / 255.0;
      let barHeight = (barHeight1 + barHeight2) / 2;
      // round the wave form to penalize lowest and highest segments.
      let factor = Math.cos((i * Math.PI * 2) / nSegments) + 1;
      if (i < 2) {
        factor *= 1.5;
      }
      barHeight = Math.pow(barHeight, 1 + factor);
      // convert to percentage
      barHeight *= 100;
      bar.style.height = `${barHeight}%`;
    });
  }

  function resumeAndDraw() {
    stopDrawing();
    draw();
  }
  function stopDrawing() {
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  }

  // Start updating when the audio plays
  audio.addEventListener("play", resumeAndDraw);
  if (!audio.paused) {
    resumeAndDraw();
  }
  audio.addEventListener("pause", stopDrawing);
  return {
    destroy() {
      stopDrawing();
      for (const bar of bars) {
        container.removeChild(bar);
      }
    },
  };
}
