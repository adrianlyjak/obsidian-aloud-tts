import { Content, GenerateContentResponse, GoogleGenAI } from "@google/genai";
import { pcmBufferToMp3Buffer } from "../util/audioProcessing";
import { base64ToArrayBuffer } from "../util/misc";
import {
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";
import { TTSPluginSettings } from "../player/TTSPluginSettings";

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com";

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
      contextMode: settings.gemini_contextMode,
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
 * reraises the exception as a TTSErrorInfo, mapping google gen ai error to a tts error info
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
  } else if (error.name !== "ClientError") {
    return new TTSErrorInfo(error.name, {
      error: {
        message: error.message,
        type: error.name,
        code: "unknown",
        param: null,
      },
    });
  }

  // Extract JSON from error message if present
  // Format: "got status: {statusCode} . {jsonObject}"
  const message = error.message;
  const jsonStart = message.indexOf(". {");

  if (jsonStart !== -1) {
    try {
      const jsonStr = message.substring(jsonStart + 2); // Skip '. '
      const geminiResponse = JSON.parse(jsonStr);

      if (geminiResponse.error) {
        const geminiError = geminiResponse.error;

        // Extract HTTP status code from message prefix
        const statusMatch = message.match(/got status: (\d+)/);
        const httpErrorCode = statusMatch
          ? parseInt(statusMatch[1], 10)
          : undefined;

        // Map to ErrorMessage format expected by TTSErrorInfo
        const errorDetails = {
          error: {
            message: geminiError.message || "Unknown error",
            type: geminiError.status || "unknown",
            code: String(geminiError.code || "unknown"),
            param: geminiError.details || null,
          },
        };

        return new TTSErrorInfo(
          geminiError.status || error.name,
          errorDetails,
          httpErrorCode,
        );
      }
    } catch (parseError) {
      console.warn("Failed to parse Gemini error JSON:", parseError);
      return new TTSErrorInfo(error.name || "ClientError", {
        error: {
          message: error.message,
          type: error.name,
          code: "unknown",
          param: null,
        },
      });
    }
  }

  // Fallback for any other error format
  return new TTSErrorInfo(error.name || "ClientError", {
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
  contexts: string[],
  settings: TTSPluginSettings,
): Promise<ArrayBuffer> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model: options.model,
      contents: formatMessages(options.instructions, contexts, text),
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: options.voice && {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: options.voice },
          },
        },
      },
    });
  } catch (error) {
    throw mapGenAIError(error);
  }
  const res = response.candidates?.[0]?.content?.parts?.[0];
  const generation = res?.inlineData?.data;
  if (!generation) {
    console.error("Gemini response missing generations:", res);
    throw new Error("Gemini response missing generations");
  }

  return pcmBufferToMp3Buffer(base64ToArrayBuffer(generation), {
    sampleRate: 24000,
    channels: 1,
    bitDepth: 16,
  });
}

function formatMessages(
  instructions: string | undefined,
  contexts: string[] | undefined,
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
  if (contexts?.length) {
    prompt += `\n\nRead the content continuing from this previously ready passage:
<previous_context>
    ${contexts.join("")}
</previous_context>`;
  }
  prompt += `\n\nContent: ${text}`;
  return [{ role: "user", parts: [{ text: prompt }] }];
}
