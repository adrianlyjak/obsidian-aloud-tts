import type {
  FishSentencePause,
  TTSPluginSettings,
} from "../player/TTSPluginSettings";
import {
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type AudioData,
  type AudioTextContext,
  type ErrorMessage,
  type TTSModel,
  type TTSModelOptions,
} from "./tts-model";

export const FISH_API_URL = "https://api.fish.audio";

export interface FishVoice {
  id: string;
  title: string;
  visibility: "public" | "unlist" | "private";
  state: "created" | "training" | "trained" | "failed";
  type: "svc" | "tts";
}

/**
 * Minimal HTTP interface for Fish Audio requests. Allows the Obsidian layer
 * to inject `requestUrl` (which bypasses Electron's CORS restrictions) without
 * importing Obsidian APIs into this cross-platform package.
 */
export type FishHttpFetch = (request: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ status: number; arrayBuffer: ArrayBuffer; json: unknown }>;

const defaultFetch: FishHttpFetch = async ({
  url,
  method = "GET",
  headers,
  body,
  signal,
}) => {
  const res = await fetch(url, { method, headers, body, signal });
  const arrayBuffer = await res.arrayBuffer();
  let json: unknown = null;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
  } catch {
    // binary body (audio) — expected for 200 TTS responses
  }
  return { status: res.status, arrayBuffer, json };
};

/**
 * Creates a Fish Audio TTSModel with a custom HTTP fetch implementation.
 * Use this in environments where the default `fetch` is blocked by CORS
 * (e.g. Obsidian's Electron renderer). Pass a wrapper around `requestUrl`
 * from the `obsidian` package.
 */
export function createFishModel(
  fetchFn: FishHttpFetch = defaultFetch,
): TTSModel {
  return {
    call: (text, options, settings, context, signal) =>
      fishCallTextToSpeech(text, options, settings, context, signal, fetchFn),
    validateConnection: async (settings) => {
      if (!settings.fish_apiKey) return REQUIRE_API_KEY;
      return validateApiKeyFish(settings.fish_apiKey, fetchFn);
    },
    convertToOptions: (settings): TTSModelOptions => ({
      apiKey: settings.fish_apiKey,
      model: settings.fish_model,
      voice: settings.fish_voiceId,
      instructions: settings.fish_sentencePause,
    }),
  };
}

export const fishTextToSpeech: TTSModel = createFishModel();

export async function validateApiKeyFish(
  apiKey: string,
  fetchFn: FishHttpFetch = defaultFetch,
): Promise<string | undefined> {
  try {
    await listFishVoices(apiKey, true, fetchFn);
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
    return "Cannot connect to Fish Audio API";
  }
}

export async function fishCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  _settings: TTSPluginSettings,
  _context: AudioTextContext = {},
  signal?: AbortSignal,
  fetchFn: FishHttpFetch = defaultFetch,
): Promise<AudioData> {
  if (!options.voice) {
    throw new TTSErrorInfo("Voice model ID is required for Fish Audio TTS", {
      error: {
        message: "Voice model ID is required for Fish Audio TTS",
        type: "invalid_request_error",
        code: "missing_voice",
        param: null,
      },
    });
  }
  const sentencePause = parseFishSentencePause(options.instructions);

  const raw = await fetchFn({
    url: `${FISH_API_URL}/v1/tts`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey || ""}`,
      "Content-Type": "application/json",
      model: options.model,
    },
    body: JSON.stringify({
      text: addFishSentencePauses(text, sentencePause),
      reference_id: options.voice,
      format: "mp3",
      mp3_bitrate: 128,
      normalize: sentencePause === "none",
    }),
    signal,
  });

  await validate200Fish({
    status: raw.status,
    json: () => Promise.resolve(raw.json),
  });
  return {
    data: raw.arrayBuffer,
    format: "mp3",
  };
}

export function addFishSentencePauses(
  text: string,
  sentencePause: FishSentencePause,
): string {
  const pauseTag = fishPauseTag(sentencePause);
  if (!pauseTag) {
    return text;
  }

  const textWithInternalPauses = text.replace(
    /([.!?]["')\]]?)(\s+)/g,
    `$1 ${pauseTag}$2`,
  );

  return textWithInternalPauses.replace(
    /([.!?]["')\]]?)(\s*)$/u,
    `$1 ${pauseTag}$2`,
  );
}

function parseFishSentencePause(value: string | undefined): FishSentencePause {
  return value === "short" || value === "long" ? value : "none";
}

function fishPauseTag(sentencePause: FishSentencePause): string | undefined {
  switch (sentencePause) {
    case "short":
      return "(break)";
    case "long":
      return "(long-break)";
    case "none":
      return undefined;
  }
}

export async function listFishVoices(
  apiKey: string,
  self: boolean,
  fetchFn: FishHttpFetch = defaultFetch,
): Promise<FishVoice[]> {
  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    page_size: "50",
    page_number: "1",
    sort_by: "created_at",
  });
  if (self) {
    params.set("self", "true");
  }

  const raw = await fetchFn({
    url: `${FISH_API_URL}/model?${params.toString()}`,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await validate200Fish({
    status: raw.status,
    json: () => Promise.resolve(raw.json),
  });
  return parseFishVoiceList(raw.json);
}

export async function getFishVoice(
  apiKey: string,
  voiceId: string,
  fetchFn: FishHttpFetch = defaultFetch,
): Promise<FishVoice> {
  const raw = await fetchFn({
    url: `${FISH_API_URL}/model/${encodeURIComponent(voiceId)}`,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await validate200Fish({
    status: raw.status,
    json: () => Promise.resolve(raw.json),
  });
  return parseFishVoice(raw.json);
}

export async function validate200Fish(
  response: Pick<Response, "status" | "json">,
): Promise<void> {
  if (response.status < 300) {
    return;
  }

  let errorMessage: ErrorMessage | undefined;
  try {
    errorMessage = fishErrorMessage(await response.json(), response.status);
  } catch {
    errorMessage = undefined;
  }

  throw new TTSErrorInfo(
    `HTTP ${response.status} error`,
    errorMessage,
    response.status,
  );
}

function fishErrorMessage(body: unknown, status: number): ErrorMessage {
  const bodyRecord = isRecord(body) ? body : {};
  const message = readString(bodyRecord, "message") ?? "Unknown error";
  const statusCode =
    readNumber(bodyRecord, "status")?.toString() ?? status.toString();

  return {
    error: {
      message,
      type: "fish_audio_error",
      code: statusCode,
      param: null,
    },
  };
}

function parseFishVoiceList(data: unknown): FishVoice[] {
  if (!isRecord(data) || !Array.isArray(data.items)) {
    return [];
  }
  return data.items.map(parseFishVoice);
}

function parseFishVoice(data: unknown): FishVoice {
  const record = isRecord(data) ? data : {};
  return {
    id: readString(record, "_id") ?? "",
    title: readString(record, "title") ?? "Untitled voice",
    visibility: parseVisibility(readString(record, "visibility")),
    state: parseState(readString(record, "state")),
    type: parseType(readString(record, "type")),
  };
}

function parseVisibility(value: string | undefined): FishVoice["visibility"] {
  if (value === "private" || value === "unlist" || value === "public") {
    return value;
  }
  return "public";
}

function parseState(value: string | undefined): FishVoice["state"] {
  if (
    value === "created" ||
    value === "training" ||
    value === "trained" ||
    value === "failed"
  ) {
    return value;
  }
  return "created";
}

function parseType(value: string | undefined): FishVoice["type"] {
  if (value === "tts" || value === "svc") {
    return value;
  }
  return "tts";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}
