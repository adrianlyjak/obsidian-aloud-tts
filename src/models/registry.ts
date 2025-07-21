import { ModelProvider } from "../player/TTSPluginSettings";
import { TTSModel } from "./tts-model";
import { openAITextToSpeech } from "./openai";
import { geminiTextToSpeech } from "./gemini";
import { humeTextToSpeech } from "./hume";
import { openAILikeTextToSpeech } from "./openai-like";
import { elevenLabsTextToSpeech } from "./elevenlabs";
import { azureTextToSpeech } from "./azure";

export const REGISTRY: Record<ModelProvider, TTSModel> = {
  openai: openAITextToSpeech,
  gemini: geminiTextToSpeech,
  hume: humeTextToSpeech,
  openaicompat: openAILikeTextToSpeech,
  elevenlabs: elevenLabsTextToSpeech,
  azure: azureTextToSpeech,
};

export function hasNamedVoice(provider: ModelProvider): boolean {
  return provider !== "hume" && provider !== "openaicompat";
}
