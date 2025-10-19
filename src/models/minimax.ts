import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  AudioTextContext,
  REQUIRE_API_KEY,
  TTSModel,
  TTSModelOptions,
  validate200,
} from "./tts-model";
import { hexToArrayBuffer } from "../util/misc";

export const MINIMAX_API_URL = "https://api.minimax.io";

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

  await validate200(response, (body) => {
    try {
      const b = body as any;
      if (b?.base_resp && b.base_resp.status_code !== 0) {
        return {
          error: {
            message: b.base_resp.status_msg || "Request failed",
            type: "minimax_error",
            code: String(b.base_resp.status_code ?? "unknown"),
            param: null,
          },
        };
      }
    } catch (_e) {
      // ignore parse errors; fall back to generic
    }
    return undefined;
  });

  const json = await response.json();
  const audioHex: string | undefined = json?.data?.audio;
  if (!audioHex) {
    throw new Error("Minimax response missing audio data");
  }
  return hexToArrayBuffer(audioHex);
}
