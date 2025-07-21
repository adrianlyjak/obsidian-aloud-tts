import { TTSPluginSettings } from "../player/TTSPluginSettings";
import {
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  TTSModel,
  TTSModelOptions,
} from "./tts-model";

export const azureTextToSpeech: TTSModel = {
  call: azureCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.azure_apiKey) {
      return REQUIRE_API_KEY;
    }
    if (!settings.azure_region) {
      return "Please specify an Azure region";
    }
    return await validateApiKeyAzure(
      settings.azure_apiKey,
      settings.azure_region,
    );
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.azure_apiKey,
      apiUri: `https://${settings.azure_region}.tts.speech.microsoft.com`,
      voice: settings.azure_voice,
      model: settings.azure_outputFormat,
      contextMode: settings.azure_contextMode,
    };
  },
};

export async function validateApiKeyAzure(
  apiKey: string,
  region: string,
): Promise<string | undefined> {
  try {
    await listAzureVoices(apiKey, region);
    return undefined;
  } catch (error) {
    if (error instanceof TTSErrorInfo) {
      if (error.httpErrorCode === 401) {
        return "Invalid API key or region";
      } else if (error.httpErrorCode !== undefined) {
        return `HTTP error code ${error.httpErrorCode}: ${error.ttsJsonMessage() || error.message}`;
      } else {
        return error.ttsJsonMessage() || error.message;
      }
    }
    return "Cannot connect to Azure Speech Services";
  }
}

export async function azureCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  contexts: string[],
  settings: TTSPluginSettings,
): Promise<ArrayBuffer> {
  if (!options.voice) {
    throw new Error("Voice is required for Azure TTS");
  }

  // Build SSML content
  let ssmlText = text;

  // Add context if enabled and available
  if (options.contextMode && contexts && contexts.length > 0) {
    // For Azure, we can prepend context as part of the speech
    ssmlText = contexts.join(" ") + " " + text;
  }

  const ssmlBody = `<speak version='1.0' xml:lang='en-US'>
    <voice xml:lang='en-US' name='${options.voice}'>
      ${escapeXml(ssmlText)}
    </voice>
  </speak>`;

  const response = await fetch(`${options.apiUri}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": options.apiKey || "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": options.model || "riff-24khz-16bit-mono-pcm",
      "User-Agent": "obsidian-aloud-tts",
    },
    body: ssmlBody,
  });

  await validate200Azure(response);
  return await response.arrayBuffer();
}

export async function listAzureVoices(
  apiKey: string,
  region: string,
): Promise<{ id: string; name: string; gender: string; locale: string }[]> {
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
      },
    },
  );

  await validate200Azure(response);
  const voices = await response.json();

  return voices.map((voice: any) => ({
    id: voice.ShortName,
    name: voice.DisplayName,
    gender: voice.Gender,
    locale: voice.Locale,
  }));
}

export const AZURE_REGIONS = [
  "eastus",
  "eastus2",
  "westus",
  "westus2",
  "westus3",
  "centralus",
  "northcentralus",
  "southcentralus",
  "westcentralus",
  "canadacentral",
  "brazilsouth",
  "northeurope",
  "westeurope",
  "uksouth",
  "francecentral",
  "germanywestcentral",
  "norwayeast",
  "switzerlandnorth",
  "switzerlandwest",
  "swedencentral",
  "eastasia",
  "southeastasia",
  "japaneast",
  "japanwest",
  "koreacentral",
  "australiaeast",
  "centralindia",
  "jioindiawest",
  "uaenorth",
] as const;

export const AZURE_OUTPUT_FORMATS = [
  { label: "MP3 44.1kHz 128kbps", value: "audio-16khz-128kbitrate-mono-mp3" },
  { label: "MP3 24kHz 96kbps", value: "audio-24khz-96kbitrate-mono-mp3" },
  { label: "MP3 48kHz 192kbps", value: "audio-48khz-192kbitrate-mono-mp3" },
  { label: "WAV 16kHz 16-bit", value: "riff-16khz-16bit-mono-pcm" },
  { label: "WAV 24kHz 16-bit", value: "riff-24khz-16bit-mono-pcm" },
  { label: "WAV 48kHz 16-bit", value: "riff-48khz-16bit-mono-pcm" },
] as const;

async function validate200Azure(response: Response) {
  if (response.status >= 300) {
    let errorMessage: ErrorMessage | undefined;
    try {
      const jsonBody = await response.json();
      if (jsonBody.error) {
        errorMessage = {
          error: {
            message: jsonBody.error.message || "Unknown error",
            type: jsonBody.error.code || "azure_error",
            code: response.status.toString(),
            param: null,
          },
        };
      }
    } catch (ex) {
      // Failed to parse JSON, use generic error
    }

    throw new TTSErrorInfo(
      `HTTP ${response.status} error`,
      errorMessage,
      response.status,
    );
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
