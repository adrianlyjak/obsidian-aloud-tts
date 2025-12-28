import { TTSPluginSettings } from "../player/TTSPluginSettings";
import { AudioData, TTSModel, TTSModelOptions } from "./tts-model";
import type { KokoroTTS, ProgressInfo as KokoroProgressInfo } from "kokoro-js";

// Kokoro model configuration
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Progress info from model download/initialization */
export type ProgressInfo = KokoroProgressInfo;

type ProgressCallback = (progress: ProgressInfo) => void;

// Lazy-loaded KokoroTTS instance
let kokoroInstance: KokoroTTS | null = null;
let kokoroLoadPromise: Promise<KokoroTTS> | null = null;

/**
 * Get or initialize the Kokoro TTS model instance.
 * This is a lazy singleton that only loads the model when first needed.
 */
export async function getKokoroInstance(
  onProgress?: ProgressCallback,
): Promise<KokoroTTS> {
  if (kokoroInstance) {
    return kokoroInstance;
  }

  if (kokoroLoadPromise) {
    return kokoroLoadPromise;
  }

  kokoroLoadPromise = loadKokoroModel(onProgress);

  try {
    kokoroInstance = await kokoroLoadPromise;
    return kokoroInstance;
  } finally {
    kokoroLoadPromise = null;
  }
}

async function loadKokoroModel(
  onProgress?: ProgressCallback,
): Promise<KokoroTTS> {
  // Dynamic import to avoid bundling issues
  const kokoroModule = await import("kokoro-js");
  const KokoroTTSClass = kokoroModule.KokoroTTS;

  const tts = await KokoroTTSClass.from_pretrained(KOKORO_MODEL_ID, {
    dtype: "q8", // 8-bit quantization for smaller download and good performance
    device: "wasm", // WASM works in Electron/Obsidian (WebGPU not available)
    progress_callback: onProgress,
  });

  return tts;
}

/**
 * Check if the Kokoro model is currently loaded
 */
export function isKokoroModelLoaded(): boolean {
  return kokoroInstance !== null;
}

/**
 * Check if the Kokoro model is currently loading
 */
export function isKokoroModelLoading(): boolean {
  return kokoroLoadPromise !== null;
}

/**
 * Clear the loaded Kokoro model instance (for testing or memory management)
 */
export function clearKokoroInstance(): void {
  kokoroInstance = null;
  kokoroLoadPromise = null;
}

/**
 * Reset the Kokoro instance - allows reloading with a new progress callback
 */
export function resetKokoroInstance(): void {
  kokoroInstance = null;
  kokoroLoadPromise = null;
}

/**
 * Get list of available Kokoro voices
 */
export async function listKokoroVoices(): Promise<string[]> {
  const tts = await getKokoroInstance();
  return tts.list_voices();
}

/**
 * Default voices available in Kokoro (hardcoded for UI before model loads)
 */
export const KOKORO_DEFAULT_VOICES: { label: string; value: string }[] = [
  // American English - Female
  { label: "af_heart (A grade)", value: "af_heart" },
  { label: "af_bella (A- grade)", value: "af_bella" },
  { label: "af_nicole", value: "af_nicole" },
  { label: "af_aoede", value: "af_aoede" },
  { label: "af_kore", value: "af_kore" },
  { label: "af_sarah", value: "af_sarah" },
  { label: "af_alloy", value: "af_alloy" },
  { label: "af_nova", value: "af_nova" },
  { label: "af_jessica", value: "af_jessica" },
  { label: "af_river", value: "af_river" },
  { label: "af_sky", value: "af_sky" },
  // American English - Male
  { label: "am_fenrir", value: "am_fenrir" },
  { label: "am_michael", value: "am_michael" },
  { label: "am_puck", value: "am_puck" },
  { label: "am_adam", value: "am_adam" },
  { label: "am_echo", value: "am_echo" },
  { label: "am_eric", value: "am_eric" },
  { label: "am_liam", value: "am_liam" },
  { label: "am_onyx", value: "am_onyx" },
  { label: "am_santa", value: "am_santa" },
  // British English - Female
  { label: "bf_emma", value: "bf_emma" },
  { label: "bf_isabella", value: "bf_isabella" },
  { label: "bf_alice", value: "bf_alice" },
  { label: "bf_lily", value: "bf_lily" },
  // British English - Male
  { label: "bm_george", value: "bm_george" },
  { label: "bm_fable", value: "bm_fable" },
  { label: "bm_lewis", value: "bm_lewis" },
  { label: "bm_daniel", value: "bm_daniel" },
];

export const kokoroTextToSpeech: TTSModel = {
  call: kokoroCallTextToSpeech,
  validateConnection: async (settings) => {
    // No API key needed for local model
    if (settings.kokoro_modelStatus !== "ready") {
      return "Kokoro model not downloaded. Please download the model first in settings.";
    }
    return undefined;
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      voice: settings.kokoro_voice,
      model: "kokoro-82m",
    };
  },
};

async function kokoroCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
): Promise<AudioData> {
  const tts = await getKokoroInstance();

  const audio = await tts.generate(text, {
    voice: options.voice || "af_heart",
  });

  // Get audio as blob and convert to ArrayBuffer
  const blob = audio.toBlob();
  const arrayBuffer = await blob.arrayBuffer();

  return {
    data: arrayBuffer,
    format: "wav",
  };
}
