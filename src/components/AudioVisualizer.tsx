import FFT from "fft.js";
import * as React from "react";

export const AudioVisualizer: React.FC<{
  audioElement: HTMLAudioElement;
  audioBuffer: AudioBuffer;
  offsetDurationSeconds: number;
}> = ({ audioElement, audioBuffer, offsetDurationSeconds }) => {
  const ref = React.useRef<HTMLElement | null>(null);
  const fft = React.useMemo(() => new FFT(512), [audioBuffer]);
  React.useEffect(() => {
    if (ref.current && audioElement && audioBuffer) {
      const destroyer = attachVisualizationToDom(
        ref.current,
        audioElement,
        audioBuffer,
        fft,
        offsetDurationSeconds,
      );
      return () => {
        destroyer.destroy();
      };
    }
  }, [ref.current, audioElement, audioBuffer, offsetDurationSeconds, fft]);

  return (
    <div className="tts-audio-visualizer" ref={(x) => (ref.current = x)}></div>
  );
};

function getFrequencyBins(
  fft: FFT,
  audioBuffer: AudioBuffer,
  audioElement: HTMLAudioElement,
  magnitudes: Float32Array,
  offsetDurationSeconds: number,
) {
  const position =
    (audioElement.currentTime - offsetDurationSeconds) * audioBuffer.sampleRate;
  const mono = audioBuffer
    .getChannelData(0)
    .subarray(position, position + fft.size);
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, mono);
  for (let i = 0; i < fft.size; i++) {
    const real = mono[i * 2];
    const imag = mono[i * 2 + 1];
    magnitudes[i] = Math.sqrt(real * real + imag * imag);
  }
  return magnitudes;
}

export function attachVisualizationToDom(
  container: HTMLElement,
  audioElement: HTMLAudioElement,
  audioBuffer: AudioBuffer,
  fft: FFT,
  offsetDurationSeconds: number,
): {
  destroy: () => void;
} {
  const bufferLength = fft.size / 2;
  const dataArray = new Float32Array(bufferLength);

  const nSegments = 8;
  const historySize = 2; // Number of frames to average over
  const barHistory = Array.from({ length: nSegments }, () =>
    Array(historySize).fill(0),
  );
  let historyIndex = 0;

  const bars = Array(nSegments)
    .fill(null)
    .map(() => document.createElement("div"));
  bars.forEach((bar) => {
    bar.classList.add("tts-audio-visualizer-bar");
    bar.style.height = "0";
    container.appendChild(bar);
  });

  let frameId: undefined | ReturnType<typeof requestAnimationFrame>;

  function draw() {
    frameId = requestAnimationFrame(draw);

    getFrequencyBins(
      fft,
      audioBuffer,
      audioElement,
      dataArray,
      offsetDurationSeconds,
    );

    const min = Math.floor(bufferLength / 32);
    const max = Math.floor(bufferLength / 6) + min;
    const segmentSize = (max - min) / nSegments;

    bars.forEach((bar, i) => {
      const index = Math.floor(min + i * segmentSize);
      const index2 = Math.floor(min + i * segmentSize + segmentSize / 2);
      const increase = 4;
      const heights = dataArray.slice(index, index2 + 1);
      const avgHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;
      let barHeight = avgHeight * increase;
      // Apply a curve to increase barHeight such that lower values change more and higher values change less
      const curveFactor = 0.5; // Adjust this factor to control the curve intensity
      barHeight = Math.pow(barHeight, curveFactor);
      const factor = Math.sin(((i + 1) / (nSegments + 2)) * Math.PI);
      barHeight = barHeight * factor;
      barHeight *= 100;

      // Update history
      barHistory[i][historyIndex] = barHeight;

      // Compute average
      const averageHeight =
        barHistory[i].reduce((sum, h) => sum + h, 0) / historySize;
      bar.style.height = `${averageHeight}%`;
    });

    // Update history index
    historyIndex = (historyIndex + 1) % historySize;
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

  resumeAndDraw();

  return {
    destroy() {
      stopDrawing();
      for (const bar of bars) {
        container.removeChild(bar);
      }
    },
  };
}
