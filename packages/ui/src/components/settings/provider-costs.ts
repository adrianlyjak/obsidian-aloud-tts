import type { ModelProvider } from "open-tts";

export type CostTier = "free" | "cheap" | "mid" | "premium";

export interface ProviderCost {
  /** USD per 1M characters, undefined = unknown/varies */
  pricePer1MChars: number | undefined;
  /** Shown instead of a price when the provider is free */
  freeLabel?: string;
  /** Cost bucket for color coding */
  tier: CostTier;
  /** Provider supports voice cloning (upload reference audio or use account clones) */
  voiceClone: boolean;
  /** Provider supports batch mode (generate full note, cache to vault) */
  batchMode: boolean;
  /** Short note shown in the table */
  note: string;
}

/**
 * Approximate pricing as of mid-2025. Shown as a guide only — check provider
 * sites for current rates. All figures in USD per 1M input characters.
 *
 * Sources:
 *   OpenAI      platform.openai.com/docs/pricing
 *   ElevenLabs  elevenlabs.io/pricing
 *   Fish Audio  fish.audio/pricing
 *   Gemini      ai.google.dev/pricing
 *   Azure       azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services
 *   Polly       aws.amazon.com/polly/pricing
 *   MiniMax     platform.minimaxi.com/document/pricing
 *   Hume        hume.ai/pricing
 *   Inworld     inworld.ai/pricing
 */
export const PROVIDER_COSTS: Record<ModelProvider, ProviderCost> = {
  chatterbox: {
    pricePer1MChars: 0,
    freeLabel: "Free",
    tier: "free",
    voiceClone: true,
    batchMode: true,
    note: "Local compute only",
  },
  gemini: {
    pricePer1MChars: 0,
    freeLabel: "Free",
    tier: "free",
    voiceClone: false,
    batchMode: false,
    note: "Rate-limited (~2 RPM)",
  },
  inworld: {
    pricePer1MChars: 0,
    freeLabel: "Free*",
    tier: "free",
    voiceClone: false,
    batchMode: false,
    note: "Free tier, limits apply",
  },
  fish: {
    pricePer1MChars: 0.15,
    tier: "cheap",
    voiceClone: true,
    batchMode: true,
    note: "1M chars/mo free",
  },
  minimax: {
    pricePer1MChars: 0.1,
    tier: "cheap",
    voiceClone: false,
    batchMode: true,
    note: "speech-02-turbo",
  },
  azure: {
    pricePer1MChars: 16,
    tier: "mid",
    voiceClone: false,
    batchMode: false,
    note: "Neural voices, 60+ languages",
  },
  polly: {
    pricePer1MChars: 16,
    tier: "mid",
    voiceClone: false,
    batchMode: false,
    note: "Neural voices, AWS ecosystem",
  },
  openai: {
    pricePer1MChars: 15,
    tier: "mid",
    voiceClone: false,
    batchMode: false,
    note: "tts-1 · tts-1-hd $30/1M",
  },
  hume: {
    pricePer1MChars: 60,
    tier: "premium",
    voiceClone: false,
    batchMode: false,
    note: "Emotion-aware synthesis",
  },
  elevenlabs: {
    pricePer1MChars: 165,
    tier: "premium",
    voiceClone: true,
    batchMode: false,
    note: "Best voice quality",
  },
  openaicompat: {
    pricePer1MChars: undefined,
    tier: "free",
    voiceClone: false,
    batchMode: false,
    note: "Depends on backend",
  },
};

/** Max known price for log-scale bar calculation */
const MAX_PRICE = 165;

/**
 * Returns 0–1 bar width using log scale so free/cheap/mid/premium
 * all have visually distinct bars despite a 0–165 range.
 */
export function costBarWidth(cost: ProviderCost): number {
  if (cost.pricePer1MChars === undefined) return 0;
  if (cost.pricePer1MChars === 0) return 1;
  return Math.log(cost.pricePer1MChars + 1) / Math.log(MAX_PRICE + 1);
}

export function formatCostForChars(
  cost: ProviderCost,
  charCount: number,
): string {
  if (cost.freeLabel) return cost.freeLabel;
  if (cost.pricePer1MChars === undefined) return "varies";
  const dollars = (cost.pricePer1MChars * charCount) / 1_000_000;
  if (dollars < 0.001) return "< $0.001";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatPer1M(cost: ProviderCost): string {
  if (cost.freeLabel) return cost.freeLabel;
  if (cost.pricePer1MChars === undefined) return "varies";
  if (cost.pricePer1MChars === 0) return "Free";
  return `$${cost.pricePer1MChars.toFixed(2)}`;
}
