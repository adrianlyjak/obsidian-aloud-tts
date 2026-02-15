import { test, expect } from "@playwright/test";
import { TestContext, getOpenAIApiKey, configureOpenAI } from "./helpers";

/**
 * Long-running memory leak test for TTS playback.
 *
 * Plays a document with ~35 chunks through the web player and monitors
 * JS heap memory via CDP. Asserts that memory growth plateaus after an
 * initial warmup rather than growing linearly — which would indicate
 * AudioBuffer / SourceBuffer accumulation (root cause of Oilpan crashes).
 *
 * RUN (separate from normal e2e suite):
 *   OPENAI_API_KEY=sk-... npx playwright test --config playwright.memory.config.ts
 *
 * VERIFY THE LEAK EXISTS (on code before the fix):
 *   git stash                    # stash the memory fixes
 *   OPENAI_API_KEY=sk-... npx playwright test --config playwright.memory.config.ts
 *   git stash pop                # restore the fixes
 *
 * The test prints a memory trajectory table and a final verdict.
 * Expected runtime: 3–6 minutes depending on TTS API latency.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Number of sentences to generate. Each becomes a TTS chunk. */
const SENTENCE_COUNT = 35;

/** Milliseconds between memory samples. */
const SAMPLE_INTERVAL_MS = 4_000;

/** Chunks processed before we start measuring "steady state". */
const WARMUP_CHUNKS = 10;

/**
 * Maximum acceptable memory growth rate after warmup (bytes per chunk).
 *
 * With the fix: AudioBuffers are released from played chunks → slope ≈ 0.
 * Without the fix: decoded PCM AudioBuffers accumulate at ~0.5–1.5 MB/chunk.
 *
 * 300 KB/chunk is a conservative threshold that catches real leaks while
 * tolerating normal GC jitter.
 */
const MAX_GROWTH_RATE_BYTES_PER_CHUNK = 300_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateLongText(count: number): string {
  const templates = [
    "The morning sun cast long golden shadows across the dew-covered meadow as birds began their chorus",
    "Ancient oak trees lined the winding path that led through the heart of the peaceful forest",
    "Gentle waves lapped against the rocky shoreline while seagulls circled overhead in the salty breeze",
    "The old clocktower chimed twelve times echoing across the cobblestone streets of the quiet village",
    "A thick blanket of fog rolled in from the harbor obscuring the lighthouse beam in the early dawn",
    "Wild horses galloped freely across the open plains their manes flowing in the warm summer wind",
    "The aroma of freshly baked bread drifted from the corner bakery filling the entire neighborhood",
    "Snow covered peaks glistened under the pale winter sun as hikers prepared for the mountain trail",
    "Fireflies danced above the still pond creating a magical display of light in the warm evening air",
    "The old stone bridge arched gracefully over the stream connecting the two halves of the small town",
  ];
  // Each sentence is distinct enough to produce its own TTS chunk
  return Array.from(
    { length: count },
    (_, i) => `${templates[i % templates.length]} in passage number ${i + 1}.`,
  ).join(" ");
}

interface MemorySample {
  chunksProcessed: number;
  jsHeapUsedMB: number;
}

/**
 * Ordinary least-squares linear regression.
 * Returns the slope (y per unit x) and R² (coefficient of determination).
 */
function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssTot = points.reduce((s, p) => s + (p.y - sumY / n) ** 2, 0);
  const ssRes = points.reduce((s, p) => {
    const predicted = slope * p.x + intercept;
    return s + (p.y - predicted) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, r2 };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test("JS heap memory plateaus during long TTS playback", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  const apiKey = getOpenAIApiKey();
  const ctx = new TestContext(page);

  // -- Setup --
  await ctx.reset();
  await ctx.settings.open();
  await configureOpenAI(ctx.settings, { apiKey });
  await ctx.settings.close();

  // Enter long text. Use insertText (single input event) instead of
  // keyboard.type (char-by-char) — 35 sentences would take ages otherwise.
  const longText = generateLongText(SENTENCE_COUNT);
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(longText);
  // Move cursor to start so playback begins from the top
  await page.locator(".cm-line").first().click({ position: { x: 0, y: 5 } });

  // -- CDP for precise memory metrics --
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  async function sampleHeapMB(): Promise<number> {
    // Force GC so the measurement reflects actual retained memory, not
    // garbage awaiting collection.
    try {
      await cdp.send("HeapProfiler.collectGarbage");
    } catch {
      // Some Chromium builds may not support this — fall back to raw reading
    }
    await page.waitForTimeout(200); // brief pause for GC finalization
    const { metrics } = await cdp.send("Performance.getMetrics");
    const heap = metrics.find((m) => m.name === "JSHeapUsedSize");
    return (heap?.value ?? 0) / (1024 * 1024);
  }

  // -- Baseline --
  const baselineMB = await sampleHeapMB();
  console.log(`\n  Baseline heap: ${baselineMB.toFixed(1)} MB\n`);

  // -- Start playback --
  await ctx.player.play();
  await ctx.waitForTTSRequests(1);

  // -- Sample memory as chunks are processed --
  const samples: MemorySample[] = [];
  let prevChunks = 0;
  let stallCount = 0;
  const MAX_STALLS = 15; // stop after ~60s of no new chunks

  console.log("  Chunk | JS Heap (MB) | Delta from baseline");
  console.log("  ------|--------------|--------------------");

  while (true) {
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);

    const chunksNow = ctx.tracker.responseStatuses.length;
    const heapMB = await sampleHeapMB();
    const deltaMB = heapMB - baselineMB;

    samples.push({ chunksProcessed: chunksNow, jsHeapUsedMB: heapMB });

    console.log(
      `  ${String(chunksNow).padStart(5)} | ${heapMB.toFixed(1).padStart(12)} | ${deltaMB >= 0 ? "+" : ""}${deltaMB.toFixed(1)} MB`,
    );

    // Done?
    if (chunksNow >= SENTENCE_COUNT - 1) {
      console.log("\n  All chunks processed.");
      break;
    }

    // Stall detection — stop if nothing is progressing
    if (chunksNow === prevChunks) {
      stallCount++;
      if (stallCount >= MAX_STALLS) {
        console.log(
          `\n  Stalled at ${chunksNow} chunks for ${(MAX_STALLS * SAMPLE_INTERVAL_MS) / 1000}s. Analyzing what we have.`,
        );
        break;
      }
    } else {
      stallCount = 0;
    }
    prevChunks = chunksNow;
  }

  // -- Analysis --
  const steadyState = samples.filter(
    (s) => s.chunksProcessed >= WARMUP_CHUNKS,
  );

  if (steadyState.length < 3) {
    console.log(
      `\n  WARNING: Only ${steadyState.length} post-warmup samples. Need ≥3 for analysis.`,
    );
    console.log(
      "  Test is inconclusive — not enough chunks were processed.\n",
    );
    return;
  }

  const points = steadyState.map((s) => ({
    x: s.chunksProcessed,
    y: s.jsHeapUsedMB,
  }));
  const { slope: slopeMBPerChunk, r2 } = linearRegression(points);
  const slopeKBPerChunk = slopeMBPerChunk * 1024;
  const slopeBytesPerChunk = slopeMBPerChunk * 1024 * 1024;

  const peakMB = Math.max(...samples.map((s) => s.jsHeapUsedMB));
  const lastSample = samples[samples.length - 1];
  const totalGrowthMB = lastSample.jsHeapUsedMB - baselineMB;

  console.log("\n  ========== MEMORY ANALYSIS ==========");
  console.log(`  Baseline:          ${baselineMB.toFixed(1)} MB`);
  console.log(`  Peak:              ${peakMB.toFixed(1)} MB`);
  console.log(`  Final:             ${lastSample.jsHeapUsedMB.toFixed(1)} MB`);
  console.log(`  Total growth:      ${totalGrowthMB.toFixed(1)} MB`);
  console.log(`  Chunks processed:  ${lastSample.chunksProcessed}`);
  console.log(`  Post-warmup slope: ${slopeKBPerChunk.toFixed(1)} KB/chunk`);
  console.log(`  R² (linearity):    ${r2.toFixed(3)}`);
  console.log(
    `  Threshold:         ${(MAX_GROWTH_RATE_BYTES_PER_CHUNK / 1024).toFixed(0)} KB/chunk`,
  );
  console.log("");

  if (slopeBytesPerChunk > MAX_GROWTH_RATE_BYTES_PER_CHUNK && r2 > 0.7) {
    console.log(
      "  VERDICT: FAIL — Memory is growing linearly. Leak detected.",
    );
    console.log(
      "  Likely cause: decoded AudioBuffers and/or SourceBuffer data",
    );
    console.log("  accumulating on every chunk without eviction.");
  } else if (slopeBytesPerChunk > MAX_GROWTH_RATE_BYTES_PER_CHUNK) {
    console.log(
      "  VERDICT: MARGINAL — Slope exceeds threshold but R² is low.",
    );
    console.log(
      "  Growth may be noisy GC artifacts rather than a true leak.",
    );
  } else {
    console.log(
      "  VERDICT: PASS — Memory has plateaued. No significant leak.",
    );
  }
  console.log("  =====================================\n");

  // -- Assertion --
  expect(
    slopeBytesPerChunk,
    `Memory growing at ${slopeKBPerChunk.toFixed(0)} KB/chunk after warmup ` +
      `(R²=${r2.toFixed(2)}). Decoded AudioBuffers or SourceBuffer data ` +
      `may be accumulating without eviction.`,
  ).toBeLessThan(MAX_GROWTH_RATE_BYTES_PER_CHUNK);
});
