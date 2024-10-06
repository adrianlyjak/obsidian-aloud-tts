import * as React from "react";

export const AudioVisualizer: React.FC<{
  audioElement: HTMLAudioElement;
}> = ({ audioElement }) => {
  const ref = React.useRef<HTMLElement | null>(null);
  const audioContext = React.useMemo(
    () => getAnalyser(audioElement),
    [audioElement],
  );
  React.useEffect(() => {
    if (ref.current && audioContext) {
      const destroyer = attachVisualizationToDom(
        ref.current,
        audioContext.analyser,
      );
      return () => {
        destroyer.destroy();
      };
    }
  }, [ref.current, audioContext]);

  return (
    <div className="tts-audio-visualizer" ref={(x) => (ref.current = x)}></div>
  );
};

function attachVisualizationToDom(
  container: HTMLElement,
  analyzer: AnalyserNode,
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
    bar.classList.add("tts-audio-visualizer-bar");
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

interface ContextAnalyzerSource {
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
}
const _state = new WeakMap<HTMLAudioElement, ContextAnalyzerSource>();

function getAnalyser(audioElement: HTMLAudioElement): ContextAnalyzerSource {
  function newOne() {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(context.destination);
    return { context, analyser, source };
  }
  const existing = _state.get(audioElement);
  if (existing) {
    return existing;
  } else {
    const state = newOne();
    _state.set(audioElement, state);
    return state;
  }
}
