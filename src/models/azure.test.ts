import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  azureCallTextToSpeech,
  listAzureVoices,
  validateApiKeyAzure,
  azureTextToSpeech,
} from "./azure";
import { TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Mock the global fetch
global.fetch = vi.fn();

describe("Azure TTS Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("azureTextToSpeech", () => {
    describe("convertToOptions", () => {
      it("should convert settings to options correctly", () => {
        const testSettings = {
          ...DEFAULT_SETTINGS,
          azure_apiKey: "test-api-key",
          azure_region: "eastus",
          azure_voice: "en-US-JennyNeural",
          azure_outputFormat: "audio-24khz-96kbitrate-mono-mp3",
        };

        const options = azureTextToSpeech.convertToOptions(testSettings);

        expect(options).toEqual({
          apiKey: "test-api-key",
          apiUri: "https://eastus.tts.speech.microsoft.com",
          voice: "en-US-JennyNeural",
          model: "audio-24khz-96kbitrate-mono-mp3",
        });
      });
    });

    describe("validateConnection", () => {
      it("should require API key", async () => {
        const testSettings = {
          ...DEFAULT_SETTINGS,
          azure_apiKey: "",
          azure_region: "eastus",
        };

        const result = await azureTextToSpeech.validateConnection(testSettings);

        expect(result).toContain("Please enter an API key");
      });

      it("should require region", async () => {
        const testSettings = {
          ...DEFAULT_SETTINGS,
          azure_apiKey: "test-key",
          azure_region: "",
        };

        const result = await azureTextToSpeech.validateConnection(testSettings);

        expect(result).toBe("Please specify an Azure region");
      });

      it("should validate API key and region by listing voices", async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue([
            {
              ShortName: "en-US-JennyNeural",
              DisplayName: "Jenny",
              Gender: "Female",
              Locale: "en-US",
            },
          ]),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as any);

        const testSettings = {
          ...DEFAULT_SETTINGS,
          azure_apiKey: "valid-api-key",
          azure_region: "eastus",
        };

        const result = await azureTextToSpeech.validateConnection(testSettings);

        expect(result).toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(
          "https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/list",
          expect.objectContaining({
            headers: expect.objectContaining({
              "Ocp-Apim-Subscription-Key": "valid-api-key",
            }),
          }),
        );
      });

      it("should return error message for invalid API key or region", async () => {
        const mockResponse = {
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({
            error: { message: "Invalid subscription key", code: "401" },
          }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as any);

        const testSettings = {
          ...DEFAULT_SETTINGS,
          azure_apiKey: "invalid-api-key",
          azure_region: "eastus",
        };

        const result = await azureTextToSpeech.validateConnection(testSettings);

        expect(result).toBe("Invalid API key or region");
      });
    });
  });

  describe("azureCallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      apiUri: "https://eastus.tts.speech.microsoft.com",
      voice: "en-US-JennyNeural",
      model: "audio-24khz-96kbitrate-mono-mp3",
    };

    it("should make correct SSML API call for basic TTS request", async () => {
      const mockAudioBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await azureCallTextToSpeech(
        "Hello world",
        mockOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": "test-api-key",
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "obsidian-aloud-tts",
          },
          body: expect.stringContaining("Hello world"),
        },
      );

      // Check that SSML is properly formatted
      const callArgs = vi.mocked(fetch).mock.calls[0];
      const ssmlBody = callArgs[1]?.body as string;
      expect(ssmlBody).toContain("<speak version='1.0' xml:lang='en-US'>");
      expect(ssmlBody).toContain(
        "<voice xml:lang='en-US' name='en-US-JennyNeural'>",
      );
      expect(ssmlBody).toContain("Hello world");
      expect(ssmlBody).toContain("</voice>");
      expect(ssmlBody).toContain("</speak>");

      expect(result.data).toBe(mockAudioBuffer);
      expect(result.format).toBe("mp3");
    });

    it("should properly escape XML characters", async () => {
      const mockAudioBuffer = new ArrayBuffer(256);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await azureCallTextToSpeech(
        'Hello "world" & <test>',
        mockOptions,
        DEFAULT_SETTINGS,
        {},
      );

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const ssmlBody = callArgs[1]?.body as string;

      // Should escape XML characters
      expect(ssmlBody).toContain("Hello &quot;world&quot; &amp; &lt;test&gt;");
    });

    it("should throw error when voice is not provided", async () => {
      const optionsWithoutVoice: TTSModelOptions = {
        ...mockOptions,
        voice: undefined,
      };

      await expect(
        azureCallTextToSpeech(
          "Hello world",
          optionsWithoutVoice,
          DEFAULT_SETTINGS,
          {},
        ),
      ).rejects.toThrow("Voice is required for Azure TTS");
    });

    it("should handle API errors correctly", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: { message: "Invalid SSML", code: "InvalidRequest" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(
        azureCallTextToSpeech("Hello world", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow();
    });

    it("should use default output format when model is not specified", async () => {
      const mockAudioBuffer = new ArrayBuffer(512);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const optionsWithoutModel: TTSModelOptions = {
        ...mockOptions,
        model: "",
      };

      await azureCallTextToSpeech(
        "Hello world",
        optionsWithoutModel,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          }),
        }),
      );
    });
  });

  describe("listAzureVoices", () => {
    it("should fetch and format voices correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([
          {
            ShortName: "en-US-JennyNeural",
            DisplayName: "Jenny",
            Gender: "Female",
            Locale: "en-US",
          },
          {
            ShortName: "en-US-RyanNeural",
            DisplayName: "Ryan",
            Gender: "Male",
            Locale: "en-US",
          },
        ]),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await listAzureVoices("test-api-key", "eastus");

      expect(fetch).toHaveBeenCalledWith(
        "https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/list",
        {
          headers: {
            "Ocp-Apim-Subscription-Key": "test-api-key",
          },
        },
      );

      expect(result).toEqual([
        {
          id: "en-US-JennyNeural",
          name: "Jenny",
          gender: "Female",
          locale: "en-US",
        },
        {
          id: "en-US-RyanNeural",
          name: "Ryan",
          gender: "Male",
          locale: "en-US",
        },
      ]);
    });

    it("should handle API errors", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: { message: "Invalid subscription key", code: "401" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(listAzureVoices("invalid-key", "eastus")).rejects.toThrow();
    });
  });

  describe("validateApiKeyAzure", () => {
    it("should return undefined for valid API key and region", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await validateApiKeyAzure("valid-key", "eastus");

      expect(result).toBeUndefined();
    });

    it("should return error message for invalid API key", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: { message: "Invalid subscription key", code: "401" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await validateApiKeyAzure("invalid-key", "eastus");

      expect(result).toBe("Invalid API key or region");
    });

    it("should handle general connection errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      const result = await validateApiKeyAzure("test-key", "eastus");

      expect(result).toBe("Cannot connect to Azure Speech Services");
    });

    it("should handle HTTP errors with custom messages", async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({
          error: { message: "Quota exceeded", code: "QuotaExceeded" },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await validateApiKeyAzure("test-key", "eastus");

      expect(result).toBe("HTTP error code 403: Quota exceeded");
    });
  });
});
