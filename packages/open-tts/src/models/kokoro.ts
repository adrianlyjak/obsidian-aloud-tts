import type { TTSPluginSettings } from "../player/TTSPluginSettings";
import { base64ToArrayBuffer } from "../util/misc";
import { tokenizeWords } from "../util/wordTiming";
import {
  AudioData,
  TTSErrorInfo,
  WordTiming,
  validate200,
  type TTSModel,
  type TTSModelOptions,
} from "./tts-model";

export const DEFAULT_KOKORO_API_URL = "http://localhost:8880";

/** Kokoro-FastAPI server (https://github.com/remsky/Kokoro-FastAPI) */
export const kokoroTextToSpeech: TTSModel = {
  call: kokoroCallTextToSpeech,
  validateConnection: async (settings) => {
    try {
      await listKokoroVoices(settings.kokoro_apiBase);
      return undefined;
    } catch (error) {
      const detail =
        error instanceof TTSErrorInfo
          ? error.ttsJsonMessage() || error.message
          : String(error);
      return `Cannot connect to Kokoro at ${kokoroBaseUrl(settings.kokoro_apiBase)}: ${detail}`;
    }
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiUri: kokoroBaseUrl(settings.kokoro_apiBase),
      voice: settings.kokoro_voice,
      model: "kokoro",
    };
  },
};

export function kokoroBaseUrl(apiBase: string | undefined): string {
  return (apiBase || DEFAULT_KOKORO_API_URL).replace(/\/+$/, "");
}

interface KokoroTimestamp {
  word: string;
  start_time: number;
  end_time: number;
}

export async function kokoroCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  _settings: TTSPluginSettings,
  _context?: unknown,
  signal?: AbortSignal,
): Promise<AudioData> {
  const response = await fetch(`${options.apiUri}/dev/captioned_speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      input: text,
      voice: options.voice,
      response_format: "mp3",
      stream: false,
    }),
    signal,
  });
  await validate200(response, kokoroErrorMessage);
  const body: { audio: string; timestamps?: KokoroTimestamp[] } =
    await response.json();
  return {
    data: base64ToArrayBuffer(body.audio),
    format: "mp3",
    wordTimings: body.timestamps
      ? kokoroWordTimings(body.timestamps)
      : undefined,
  };
}

/** Kokoro reports punctuation as separate "words"; keep only real words */
export function kokoroWordTimings(timestamps: KokoroTimestamp[]): WordTiming[] {
  return timestamps.flatMap((t) =>
    tokenizeWords(t.word).map((token) => ({
      word: token.word,
      start: t.start_time,
      end: t.end_time,
    })),
  );
}

export async function listKokoroVoices(
  apiBase: string | undefined,
): Promise<string[]> {
  const response = await fetch(`${kokoroBaseUrl(apiBase)}/v1/audio/voices`);
  await validate200(response, kokoroErrorMessage);
  const body: { voices: string[] } = await response.json();
  return body.voices;
}

function kokoroErrorMessage(body: unknown) {
  const detail = (body as { detail?: unknown })?.detail;
  if (!detail) {
    return undefined;
  }
  const message =
    typeof detail === "string"
      ? detail
      : ((detail as { message?: string }).message ?? JSON.stringify(detail));
  return {
    error: { message, type: "kokoro_error", code: "", param: null },
  };
}
