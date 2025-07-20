import { openAICallTextToSpeech } from "./openai";
import { TTSModel, TTSModelOptions } from "./tts-model";

export const openaiLikeTextToSpeech: TTSModel = {
  call: openAICallTextToSpeech,
  validateConnection: async (settings) => undefined,
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.openaicompat_apiKey,
      apiUri: settings.openaicompat_apiBase,
      voice: settings.openaicompat_ttsVoice,
      instructions: undefined,
      model: settings.openaicompat_ttsModel,
      contextMode: false, // not supported
    };
  },
};
