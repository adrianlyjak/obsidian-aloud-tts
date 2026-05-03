import type { ModelProvider } from "../player/TTSPluginSettings";
import type { TTSModel } from "./tts-model";
import { openAITextToSpeech } from "./openai";
import { geminiTextToSpeech } from "./gemini";
import { humeTextToSpeech } from "./hume";
import { openAILikeTextToSpeech } from "./openai-like";
import { elevenLabsTextToSpeech } from "./elevenlabs";
import { azureTextToSpeech } from "./azure";
import { minimaxTextToSpeech } from "./minimax";
import { inworldTextToSpeech } from "./inworld";
import { pollyTextToSpeech } from "./polly";
import { fishTextToSpeech } from "./fish";

export const REGISTRY: Record<ModelProvider, TTSModel> = {
  openai: openAITextToSpeech,
  gemini: geminiTextToSpeech,
  hume: humeTextToSpeech,
  openaicompat: openAILikeTextToSpeech,
  elevenlabs: elevenLabsTextToSpeech,
  azure: azureTextToSpeech,
  minimax: minimaxTextToSpeech,
  fish: fishTextToSpeech,
  inworld: inworldTextToSpeech,
  polly: pollyTextToSpeech,
};

export function hasNamedVoice(provider: ModelProvider): boolean {
  return provider !== "hume" && provider !== "openaicompat";
}
