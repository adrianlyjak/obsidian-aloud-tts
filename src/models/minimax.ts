import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  AudioTextContext,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";
import { hexToArrayBuffer } from "../util/misc";

export const MINIMAX_API_URL = "https://api.minimax.io";

/** Shape of a successful Minimax TTS response */
export interface MinimaxTTSResponse {
  data: {
    audio: string;
    status?: number;
  };
  base_resp: {
    status_code: number;
    status_msg?: string;
  };
}

/**
 * Parse a Minimax API response, throwing a TTSErrorInfo on any error.
 * Minimax can return errors with HTTP 200, so we check base_resp.status_code.
 */
export function parseMinimaxResponse(
  responseText: string,
  httpStatus: number,
): MinimaxTTSResponse {
  let json: unknown;
  try {
    json = JSON.parse(responseText);
  } catch {
    // Failed to parse JSON - use text as error detail
    const detail = responseText.trim().slice(0, 200) || `HTTP ${httpStatus}`;
    if (httpStatus >= 300) {
      throw new TTSErrorInfo(
        detail,
        {
          error: {
            message: detail,
            type: "minimax_error",
            code: String(httpStatus),
            param: null,
          },
        },
        httpStatus,
      );
    }
    throw new Error(`Minimax response was not valid JSON: ${detail}`);
  }

  // Check for API errors in base_resp (Minimax returns these even with HTTP 200)
  const baseResp = (
    json as { base_resp?: { status_code?: number; status_msg?: string } }
  )?.base_resp;
  if (baseResp && baseResp.status_code !== 0) {
    const errorMessage = {
      error: {
        message: baseResp.status_msg || "Request failed",
        type: "minimax_error",
        code: String(baseResp.status_code ?? "unknown"),
        param: null,
      },
    };
    throw new TTSErrorInfo(
      baseResp.status_msg || "Request failed",
      errorMessage,
      httpStatus >= 300 ? httpStatus : baseResp.status_code,
    );
  }

  // Handle HTTP errors without base_resp error info
  if (httpStatus >= 300) {
    throw new TTSErrorInfo(`HTTP ${httpStatus} error`, undefined, httpStatus);
  }

  // Validate the response shape
  const minimaxData = json as MinimaxTTSResponse;
  if (!minimaxData.data?.audio) {
    throw new Error("Minimax response missing audio data");
  }
  return minimaxData;
}

export const minimaxTextToSpeech: TTSModel = {
  call: minimaxCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.minimax_apiKey) {
      return REQUIRE_API_KEY;
    }
    if (!settings.minimax_groupId) {
      return "Please enter your Minimax GroupId in the settings";
    }
    // No lightweight validation endpoint; just presence checks
    return undefined;
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.minimax_apiKey,
      model: settings.minimax_ttsModel,
      voice: settings.minimax_ttsVoice,
    };
  },
};

export async function minimaxCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  _context: AudioTextContext = {},
): Promise<ArrayBuffer> {
  const groupId = settings.minimax_groupId;
  const url = `${MINIMAX_API_URL}/v1/t2a_v2?GroupId=${encodeURIComponent(groupId)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey || ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      text: text,
      stream: false,
      voice_setting: {
        voice_id: options.voice,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
      output_format: "hex",
    }),
  });

  const responseText = await response.text();
  const parsed = parseMinimaxResponse(responseText, response.status);
  return hexToArrayBuffer(parsed.data.audio);
}
