import { openAICompatCallTextToSpeech } from "./openai";
import type { TTSModel, TTSModelOptions } from "./tts-model";

export const openAILikeTextToSpeech: TTSModel = {
  call: openAICompatCallTextToSpeech,
  validateConnection: async () => undefined,
  convertToOptions: (settings): TTSModelOptions => {
    const generationSpeed = settings.openaicompat_generationSpeed;

    return {
      apiKey: settings.openaicompat_apiKey,
      apiUri: settings.openaicompat_apiBase,
      voice: settings.openaicompat_ttsVoice,
      model: settings.openaicompat_ttsModel,
      responseFormat: settings.openaicompat_responseFormat,
      generationSpeed:
        Number.isFinite(generationSpeed) &&
        generationSpeed >= 0.3 &&
        generationSpeed <= 2.5
          ? generationSpeed
          : 1,
    };
  },
};
