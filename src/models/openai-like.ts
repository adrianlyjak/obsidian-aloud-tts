import { openAICompatCallTextToSpeech } from "./openai";
import { TTSModel, TTSModelOptions } from "./tts-model";

export const openAILikeTextToSpeech: TTSModel = {
  call: openAICompatCallTextToSpeech,
  validateConnection: async () => undefined,
  convertToOptions: (settings): TTSModelOptions => {
    const generationSpeed = Number.parseFloat(
      settings.openaicompat_generationSpeed || "1",
    );

    return {
      apiKey: settings.openaicompat_apiKey,
      apiUri: settings.openaicompat_apiBase,
      voice: settings.openaicompat_ttsVoice,
      model: settings.openaicompat_ttsModel,
      responseFormat: settings.openaicompat_responseFormat,
      generationSpeed:
        Number.isFinite(generationSpeed) &&
        generationSpeed > 0 &&
        generationSpeed <= 4
          ? generationSpeed
          : 1,
    };
  },
};
