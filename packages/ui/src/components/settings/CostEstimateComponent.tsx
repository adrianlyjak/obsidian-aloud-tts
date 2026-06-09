import * as React from "react";
import { observer } from "mobx-react-lite";
import type { ModelProvider, TTSPluginSettingsStore } from "open-tts";
import { modelProviders } from "open-tts";
import {
  PROVIDER_COSTS,
  costBarWidth,
  formatCostForChars,
  formatPer1M,
} from "./provider-costs";

const DISPLAY_NAMES: Record<ModelProvider, string> = {
  chatterbox: "Chatterbox",
  gemini: "Gemini",
  fish: "Fish Audio",
  minimax: "MiniMax",
  inworld: "Inworld",
  polly: "AWS Polly",
  azure: "Azure",
  openai: "OpenAI",
  hume: "Hume",
  elevenlabs: "ElevenLabs",
  openaicompat: "OpenAI Compatible",
};

function sortedProviders(): ModelProvider[] {
  return [...modelProviders].sort((a, b) => {
    const ca = PROVIDER_COSTS[a].pricePer1MChars;
    const cb = PROVIDER_COSTS[b].pricePer1MChars;
    if (ca === undefined && cb === undefined) return 0;
    if (ca === undefined) return 1;
    if (cb === undefined) return -1;
    return ca - cb;
  });
}

const SORTED = sortedProviders();

export const CostEstimateComponent: React.FC<{
  store: TTSPluginSettingsStore;
  testText: string;
}> = observer(({ store, testText }) => {
  const charCount = testText.trim().length;
  const showTextCost = charCount > 0;
  const active = store.settings.modelProvider;

  return (
    <div className="tts-cost-wrap">
      <div className="tts-cost-legend">
        <span className="tts-chip tts-chip-clone">🎤 voice clone</span>
        <span className="tts-chip tts-chip-batch">⚡ batch mode</span>
        {showTextCost && (
          <span className="tts-cost-charcount">
            test text: {charCount.toLocaleString()} chars
          </span>
        )}
      </div>

      <div className="tts-cost-rows">
        {SORTED.map((provider) => {
          const cost = PROVIDER_COSTS[provider];
          const isActive = active === provider;
          const barW = costBarWidth(cost);
          const textCost = showTextCost
            ? formatCostForChars(cost, charCount)
            : null;

          return (
            <div
              key={provider}
              className={`tts-cost-row tts-tier-${cost.tier}${isActive ? " tts-cost-row--active" : ""}`}
              onClick={() => store.updateModelSpecificSettings(provider, {})}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                store.updateModelSpecificSettings(provider, {})
              }
            >
              {/* Provider name + badges */}
              <div className="tts-cost-name">
                <span className="tts-cost-check">{isActive ? "✓" : ""}</span>
                <span className="tts-cost-label">
                  {DISPLAY_NAMES[provider]}
                </span>
                {cost.voiceClone && (
                  <span className="tts-chip tts-chip-clone">🎤</span>
                )}
                {cost.batchMode && (
                  <span className="tts-chip tts-chip-batch">⚡</span>
                )}
              </div>

              {/* Cost bar + price */}
              <div className="tts-cost-bar-wrap">
                <div className="tts-cost-bar-track">
                  <div
                    className="tts-cost-bar-fill"
                    style={{
                      width: `${Math.max(barW * 100, cost.pricePer1MChars === 0 ? 100 : 4)}%`,
                    }}
                  />
                </div>
                <span className="tts-cost-price">
                  {formatPer1M(cost)}
                  <span className="tts-cost-unit">/1M</span>
                </span>
                {textCost && (
                  <span className="tts-cost-text-cost">{textCost}</span>
                )}
              </div>

              {/* Note */}
              <div className="tts-cost-note">{cost.note}</div>
            </div>
          );
        })}
      </div>

      <div className="tts-cost-disclaimer">
        Approximate pricing mid-2025 · check provider sites for current rates
      </div>
    </div>
  );
});
