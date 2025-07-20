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

export function hasNamedVoice(provider: ModelProvider): boolean {
  return provider !== "hume" && provider !== "openaicompat";
}
