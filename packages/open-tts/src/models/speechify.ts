import { base64ToArrayBuffer } from "../util/misc";
import { getHttpFetch } from "../util/http";
import type { TTSPluginSettings } from "../player/TTSPluginSettings";
import type { AudioData } from "./tts-model";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type TTSModel,
  type TTSModelOptions,
  validate200,
} from "./tts-model";

export const SPEECHIFY_API_URL = "https://api.speechify.ai";

/** The speech endpoint accepts up to 2,000 characters per request. */
export const SPEECHIFY_MAX_INPUT_LENGTH = 2000;

/** Stay clear of the character limit when splitting long input. */
const SPEECHIFY_SPLIT_LENGTH = SPEECHIFY_MAX_INPUT_LENGTH - 100;

const SPEECHIFY_VOICE_PAGE_SIZE = 200;
const SPEECHIFY_MAX_VOICE_PAGES = 10;

export const SPEECHIFY_MODELS = [
  { label: "Simba 3.2 (Recommended, English)", value: "simba-3.2" },
  { label: "Simba 3.0 (Multilingual)", value: "simba-3.0" },
] as const;

export const speechifyTextToSpeech: TTSModel = {
  call: speechifyCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.speechify_apiKey) {
      return REQUIRE_API_KEY;
    }
    return await validateApiKeySpeechify(settings.speechify_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.speechify_apiKey,
      model: settings.speechify_model,
      voice: settings.speechify_voice,
    };
  },
};

export async function speechifyCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  _settings: TTSPluginSettings,
  _context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  if (!options.voice) {
    throw new TTSErrorInfo("Voice is required for Speechify TTS", {
      error: {
        message: "Voice is required for Speechify TTS",
        type: "invalid_request_error",
        code: "missing_voice",
        param: null,
      },
    });
  }

  const buffers: ArrayBuffer[] = [];
  for (const part of splitTextForSpeechify(text, SPEECHIFY_SPLIT_LENGTH)) {
    const response = await getHttpFetch()(
      `${SPEECHIFY_API_URL}/v1/audio/speech`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: part,
          voice_id: options.voice,
          model: options.model,
          audio_format: "mp3",
        }),
        signal,
      },
    );
    await validate200Speechify(response);
    const json = await response.json();
    if (!json.audio_data) {
      throw new Error("No audio content received from Speechify API");
    }
    buffers.push(base64ToArrayBuffer(json.audio_data));
  }

  return { data: concatenateBuffers(buffers), format: "mp3" };
}

/**
 * Split text into segments that fit the Speechify character limit, preferring
 * whitespace boundaries so words are not cut in half.
 */
export function splitTextForSpeechify(
  text: string,
  maxLength: number = SPEECHIFY_SPLIT_LENGTH,
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) {
      splitAt = maxLength;
    }
    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

function concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 1) {
    return buffers[0];
  }
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return result.buffer;
}

export async function validateApiKeySpeechify(
  apiKey: string,
): Promise<string | undefined> {
  try {
    await fetchSpeechifyJson<unknown>(
      `${SPEECHIFY_API_URL}/v1/voices?limit=1`,
      apiKey,
    );
    return undefined;
  } catch (error) {
    if (error instanceof TTSErrorInfo) {
      if (error.httpErrorCode === 401 || error.httpErrorCode === 403) {
        return "Invalid API key";
      } else if (error.httpErrorCode !== undefined) {
        return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
      } else {
        return error.ttsJsonMessage() || error.message;
      }
    }
    return "Cannot connect to Speechify API";
  }
}

export interface SpeechifyVoice {
  id: string;
  name: string;
  gender: string;
  locale: string;
  type: string;
  models: string[];
}

interface SpeechifyVoiceResponse {
  id: string;
  display_name: string;
  gender: string;
  locale: string;
  type: string;
  models?: { name: string }[];
}

interface SpeechifyListVoicesResponse {
  voices?: SpeechifyVoiceResponse[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export async function listSpeechifyVoices(
  apiKey: string,
  model?: string,
): Promise<SpeechifyVoice[]> {
  const voices: SpeechifyVoice[] = [];
  const seenIds = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < SPEECHIFY_MAX_VOICE_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(SPEECHIFY_VOICE_PAGE_SIZE),
    });
    if (model) {
      params.set("model", model);
    }
    if (cursor) {
      params.set("cursor", cursor);
    }
    const data = await fetchSpeechifyJson<SpeechifyListVoicesResponse>(
      `${SPEECHIFY_API_URL}/v1/voices?${params.toString()}`,
      apiKey,
    );
    for (const voice of data.voices || []) {
      if (seenIds.has(voice.id)) {
        continue;
      }
      seenIds.add(voice.id);
      voices.push({
        id: voice.id,
        name: voice.display_name,
        gender: voice.gender,
        locale: voice.locale,
        type: voice.type,
        models: (voice.models || []).map((m) => m.name),
      });
    }
    if (!data.has_more || !data.next_cursor) {
      break;
    }
    cursor = data.next_cursor;
  }
  return voices;
}

export interface SpeechifyVoiceOption {
  label: string;
  value: string;
}

/**
 * Build voice dropdown options. The Speechify catalog contains multiple voices
 * that share a display name (e.g. `dominic` and `dominic_32`), so colliding
 * labels are disambiguated with the voice id.
 */
export function speechifyVoiceOptions(
  voices: SpeechifyVoice[],
): SpeechifyVoiceOption[] {
  const labelCounts = new Map<string, number>();
  const labels = voices.map((voice) => {
    const label = `${voice.name} (${voice.locale}${
      voice.type === "personal" ? ", cloned" : ""
    })`;
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    return label;
  });
  return voices.map((voice, index) => ({
    label:
      (labelCounts.get(labels[index]) || 0) > 1
        ? `${labels[index]} [${voice.id}]`
        : labels[index],
    value: voice.id,
  }));
}

async function fetchSpeechifyJson<T>(url: string, apiKey: string): Promise<T> {
  const response = await getHttpFetch()(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  await validate200Speechify(response);
  return await response.json();
}

interface SpeechifyErrorBody {
  code?: string;
  message?: string;
  fields?: Record<string, string>;
}

async function validate200Speechify(response: Response): Promise<void> {
  await validate200(response, (body): ErrorMessage | undefined => {
    const error = (body as { error?: SpeechifyErrorBody } | undefined)?.error;
    if (!error) {
      return undefined;
    }
    return {
      error: {
        message: error.message || "Unknown error",
        type: error.code || "speechify_error",
        code: error.code || String(response.status),
        param: error.fields || null,
      },
    };
  });
}
