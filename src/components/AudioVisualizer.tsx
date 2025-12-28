import FFT from "fft.js";
import * as React from "react";

const BAR_COUNT = 6;

export interface AudioVisualizerProps {
  audioElement: HTMLAudioElement;
  audioBuffer: AudioBuffer;
  offsetDurationSeconds: number;
  /** CSS class name for the container */
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioElement,
  audioBuffer,
  offsetDurationSeconds,
  className = "tts-audio-visualizer",
}) => {
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

  return <div className={className} ref={(x) => (ref.current = x)}></div>;
};

function getFrequencyBins(
  fft: FFT,
  audioBuffer: AudioBuffer,
  audioElement: HTMLAudioElement,
  magnitudes: Float32Array,
  offsetDurationSeconds: number,
): Float32Array {
  const position =
    (audioElement.currentTime - offsetDurationSeconds) * audioBuffer.sampleRate;
  const mono = audioBuffer
    .getChannelData(0)
    .subarray(position, position + fft.size);
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, mono);
  // spectrum is interleaved [real, imag, real, imag, ...]
  const halfSize = fft.size / 2;
  for (let i = 0; i < halfSize; i++) {
    const real = spectrum[i * 2];
    const imag = spectrum[i * 2 + 1];
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

  // Use logarithmic frequency bands for more natural audio perception
  // Voice frequencies are roughly 85-255 Hz fundamental, with harmonics up to ~8kHz
  const sampleRate = audioBuffer.sampleRate;
  const minFreq = 100; // Hz - low end of voice
  const maxFreq = 6000; // Hz - upper harmonics
  const minBin = Math.max(1, Math.floor((minFreq * fft.size) / sampleRate));
  const maxBin = Math.min(
    Math.floor((maxFreq * fft.size) / sampleRate),
    bufferLength - 1,
  );

  // Create logarithmically spaced frequency band boundaries
  const bandBoundaries: number[] = [];
  for (let i = 0; i <= BAR_COUNT; i++) {
    const t = i / BAR_COUNT;
    // Logarithmic interpolation between minBin and maxBin
    const bin = Math.floor(minBin * Math.pow(maxBin / minBin, t));
    bandBoundaries.push(bin);
  }

  const bars = Array(BAR_COUNT)
    .fill(null)
    .map(() => document.createElement("div"));
  bars.forEach((bar) => {
    bar.classList.add("tts-audio-visualizer-bar");
    bar.style.height = "0";
    container.appendChild(bar);
  });

  let frameId: undefined | ReturnType<typeof requestAnimationFrame>;

  // Track running max PER BAND for balanced normalization across frequencies
  const bandRunningMax = new Float32Array(BAR_COUNT).fill(1);
  const decayFactor = 0.99; // Decay rate for running max

  function draw(): void {
    frameId = requestAnimationFrame(draw);

    getFrequencyBins(
      fft,
      audioBuffer,
      audioElement,
      dataArray,
      offsetDurationSeconds,
    );

    // Calculate band values
    const bandValues: number[] = [];

    for (let i = 0; i < BAR_COUNT; i++) {
      const startBin = bandBoundaries[i];
      const endBin = bandBoundaries[i + 1];

      // Use peak value in band for more dynamic response
      let peak = 0;
      for (let bin = startBin; bin <= endBin; bin++) {
        if (dataArray[bin] > peak) peak = dataArray[bin];
      }
      bandValues.push(peak);

      // Update per-band running max
      bandRunningMax[i] = Math.max(
        bandRunningMax[i] * decayFactor,
        peak,
        0.001,
      );
    }

    // Apply heights with per-band normalization
    bars.forEach((bar, i) => {
      // Normalize to this band's running max - this balances all bands
      let normalized = bandValues[i] / bandRunningMax[i];

      // Apply curve to enhance contrast
      normalized = Math.pow(normalized, 0.7);

      // Apply envelope shape - taper outer bars for a more rounded appearance
      // For 6 bars: creates shape like [0.5, 0.8, 1.0, 1.0, 0.8, 0.5]
      const envelope = Math.sin(((i + 1) / (BAR_COUNT + 1)) * Math.PI);
      normalized *= 0.4 + 0.6 * envelope; // Blend: 40% flat + 60% shaped

      // Clamp to 0-1 range
      const barHeight = Math.max(0, Math.min(1, normalized));

      bar.style.height = `${barHeight * 100}%`;
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
