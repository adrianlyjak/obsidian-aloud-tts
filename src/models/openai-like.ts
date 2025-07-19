import { openAICallTextToSpeech } from "./openai";
import { TTSModel } from "./tts-model";

export const openaiLikeTextToSpeech: TTSModel = {
  call: openAICallTextToSpeech,
  validateConnection: async (settings) => undefined,
  applyModelSpecificSettings: (settings) => {
    return {
      API_KEY: settings.openaicompat_apiKey,
      API_URL: settings.openaicompat_apiBase,
      ttsVoice: settings.openaicompat_ttsVoice,
      instructions: undefined,
      model: settings.openaicompat_ttsModel,
      contextMode: settings.openaicompat_contextMode, // Assuming this is always false
    };
  },
};
