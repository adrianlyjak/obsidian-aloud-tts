import { ModelProvider, TTSPluginSettings } from "../player/TTSPluginSettings";
import { TTSModel, TTSModelOptions } from "./tts-model";
import { openAITextToSpeech } from "./openai";
import { geminiTextToSpeech } from "./gemini";
import { humeTextToSpeech } from "./hume";
import { openaiLikeTextToSpeech } from "./openai-like";

export const REGISTRY: Record<ModelProvider, TTSModel> = {
  openai: openAITextToSpeech,
  gemini: geminiTextToSpeech,
  hume: humeTextToSpeech,
  openaicompat: openaiLikeTextToSpeech,
};

/**
 * Awkward tension here between the applyModelSpecificSettings and this.
 * This should probably just be embedded into the TTSModel interface as a single model options converter,
 * and the reliance on the shared options should go away.
 */
export function toModelOptions(
  pluginSettings: TTSPluginSettings,
): TTSModelOptions {
  return REGISTRY[pluginSettings.modelProvider].convertToOptions(pluginSettings);
  
}

export function hasNamedVoice(provider: ModelProvider): boolean {
  return provider !== "hume" && provider !== "openaicompat";
}
