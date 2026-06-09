import { Content, GenerateContentResponse, GoogleGenAI } from "@google/genai";
import { base64ToArrayBuffer } from "../util/misc";
import {
  AudioTextContext,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type TTSModel,
  type TTSModelOptions,
} from "./tts-model";
import type { AudioData } from "./tts-model";
import type { TTSPluginSettings } from "../player/TTSPluginSettings";

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com";

/**
 * Module-level serializer for Gemini API calls.
 *
 * Gemini free tier is ~2 RPM. ChunkLoader fires 3 parallel requests, so
 * without serialization all 3 hit 429 simultaneously and retry in sync —
 * the rate-limit cycle repeats forever. This queue ensures requests run one
 * at a time and enforces a cooldown after any 429 so the next call waits
 * until the rate-limit window has passed.
 */
class GeminiRateLimiter {
  private chain: Promise<unknown> = Promise.resolve();
  private cooldownUntil = 0;
  private readonly cooldownMs: number;

  constructor(cooldownMs = 32_000) {
    this.cooldownMs = cooldownMs;
  }

  /** Reset cooldown — used in tests to prevent state leaking between cases. */
  resetCooldown(): void {
    this.cooldownUntil = 0;
    this.chain = Promise.resolve();
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const ticket = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.chain = this.chain.then(async () => {
      const waitMs = Math.max(0, this.cooldownUntil - Date.now());
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
      try {
        resolve(await fn());
      } catch (err) {
        if (err instanceof TTSErrorInfo && err.httpErrorCode === 429) {
          this.cooldownUntil = Date.now() + this.cooldownMs;
        }
        reject(err);
      }
    });

    return ticket;
  }
}

export const geminiRateLimiter = new GeminiRateLimiter();

export const geminiTextToSpeech: TTSModel = {
  call: geminiCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.gemini_apiKey) {
      return REQUIRE_API_KEY;
    }
    return await validateApiKeyGemini(settings.gemini_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.gemini_apiKey,
      voice: settings.gemini_ttsVoice,
      instructions: settings.gemini_ttsInstructions,
      model: settings.gemini_ttsModel,
    };
  },
};

export async function validateApiKeyGemini(
  apiKey: string,
): Promise<string | undefined> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    await ai.models.list();
  } catch (error) {
    const mapped = mapGenAIError(error);
    if (
      mapped.httpErrorCode === 400 &&
      JSON.stringify(mapped).includes("API_KEY_INVALID")
    ) {
      return "Invalid API key";
    } else if (mapped.httpErrorCode !== undefined) {
      return `HTTP error code ${mapped.httpErrorCode}: ${mapped.message}`;
    } else {
      return mapped.message;
    }
  }
}

/**
 * Reraises the exception as TTSErrorInfo, mapping @google/genai errors to the
 * shared TTS error format. Handles both the legacy ClientError name and the
 * current ApiError class (which carries .status directly).
 */
function mapGenAIError(error: unknown): TTSErrorInfo {
  if (!(error instanceof Error)) {
    return new TTSErrorInfo("unknown", {
      error: {
        message: "Unknown error type",
        type: "unknown",
        code: "unknown",
        param: null,
      },
    });
  }

  // @google/genai SDK ≥2.x: ApiError carries .status (HTTP code) directly.
  // Use structural check rather than instanceof to avoid import resolution issues.
  if (error.name === "ApiError" && isApiError(error)) {
    const httpErrorCode = error.status;
    const statusLabel =
      httpErrorCode === 429
        ? "RESOURCE_EXHAUSTED"
        : httpErrorCode >= 500
          ? "SERVER_ERROR"
          : "API_ERROR";

    // Try to extract richer details from the JSON in the message
    const jsonMatch = error.message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const body = JSON.parse(jsonMatch[0]);
        const geminiError = body.error ?? body;
        return new TTSErrorInfo(
          geminiError.status || statusLabel,
          {
            error: {
              message: geminiError.message || error.message,
              type: geminiError.status || statusLabel,
              code: String(geminiError.code || httpErrorCode),
              param: geminiError.details || null,
            },
          },
          httpErrorCode,
        );
      } catch {
        // fall through to plain extraction below
      }
    }

    return new TTSErrorInfo(
      statusLabel,
      {
        error: {
          message: error.message,
          type: statusLabel,
          code: String(httpErrorCode),
          param: null,
        },
      },
      httpErrorCode,
    );
  }

  // Legacy ClientError format: "got status: NNN . {json}"
  if (error.name === "ClientError") {
    const message = error.message;
    const statusMatch = message.match(/got status: (\d+)/);
    const httpErrorCode = statusMatch
      ? parseInt(statusMatch[1], 10)
      : undefined;
    const jsonStart = message.indexOf(". {");

    if (jsonStart !== -1) {
      try {
        const geminiResponse = JSON.parse(message.substring(jsonStart + 2));
        const geminiError = geminiResponse.error;
        if (geminiError) {
          return new TTSErrorInfo(
            geminiError.status || "ClientError",
            {
              error: {
                message: geminiError.message || "Unknown error",
                type: geminiError.status || "unknown",
                code: String(geminiError.code || "unknown"),
                param: geminiError.details || null,
              },
            },
            httpErrorCode,
          );
        }
      } catch {
        // fall through
      }
    }

    return new TTSErrorInfo(
      "ClientError",
      {
        error: {
          message: error.message,
          type: "ClientError",
          code: String(httpErrorCode ?? "unknown"),
          param: null,
        },
      },
      httpErrorCode,
    );
  }

  return new TTSErrorInfo(error.name || "unknown", {
    error: {
      message: error.message,
      type: error.name || "unknown",
      code: "unknown",
      param: null,
    },
  });
}

export async function geminiCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  // Serialise through the rate limiter so parallel chunk loads never fire
  // simultaneously and a shared cooldown is respected after any 429.
  return geminiRateLimiter.run(async () => {
    const ai = new GoogleGenAI({ apiKey: options.apiKey });
    let response: GenerateContentResponse;
    try {
      // The @google/genai SDK does not currently expose AbortSignal, so we
      // race the SDK promise against the signal to free the caller on cancel.
      const generate = ai.models.generateContent({
        model: options.model,
        contents: formatMessages(options.instructions, context, text),
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: options.voice && {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voice },
            },
          },
        },
      });
      response = signal ? await raceAbort(generate, signal) : await generate;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw mapGenAIError(error);
    }
    const res = response.candidates?.[0]?.content?.parts?.[0];
    const generation = res?.inlineData?.data;
    if (!generation) {
      console.error("Gemini response missing generations:", res);
      throw new Error("Gemini response missing generations");
    }
    return {
      data: base64ToArrayBuffer(generation),
      format: "pcm",
      pcmMetadata: {
        sampleRate: 24000,
        channels: 1,
        bitDepth: 16,
      },
    };
  }); // end geminiRateLimiter.run
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function formatMessages(
  instructions: string | undefined,
  context: AudioTextContext = {},
  text: string,
): Content[] {
  let prompt =
    'Read aloud only the final content that is prefixed with "Content: ". Do not read any other text. Do not read the "Content: " prefix.';
  if (instructions) {
    prompt += `\n\nStyle the voice according to the following instructions:
<instructions>
    ${instructions}
</instructions>`;
  }
  // previous_context is intentionally omitted: Gemini TTS treats extra prompt
  // content as a text generation request and returns INVALID_ARGUMENT.
  prompt += `\n\nContent: ${text}`;
  return [{ role: "user", parts: [{ text: prompt }] }];
}

/** Structural guard for @google/genai ApiError (≥2.x), which has .status: number. */
function isApiError(error: Error): error is Error & { status: number } {
  return typeof (error as { status?: unknown }).status === "number";
}
