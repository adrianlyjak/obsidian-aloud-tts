import { openAICallTextToSpeech } from "./openai";
import { TTSModel, TTSModelOptions } from "./tts-model";

export const openAILikeTextToSpeech: TTSModel = {
  call: openAICallTextToSpeech,
  validateConnection: async () => undefined,
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.openaicompat_apiKey,
      apiUri: settings.openaicompat_apiBase,
      voice: settings.openaicompat_ttsVoice,
      model: settings.openaicompat_ttsModel,
    };
  },
};
