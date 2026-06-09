import { TTSModelOptions } from "../models/tts-model";

/**
 * Provider-agnostic permanent cache key: SHA-256 of trimmed text + model options.
 * Use this for all vault-persisted audio so keys are stable across sessions.
 */
export async function permanentCacheKey(
  text: string,
  options: TTSModelOptions,
): Promise<string> {
  const data = JSON.stringify({
    text: text.trim(),
    model: options.model || "",
    voice: options.voice || "",
    instructions: options.instructions || "",
  });
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * @deprecated Use permanentCacheKey(text, options) instead.
 * Kept for backward compatibility with Chatterbox-specific callers.
 */
export async function generateHash(
  text: string,
  voice: string,
  settings: {
    exaggeration?: number;
    cfgWeight?: number;
    temperature?: number;
  },
): Promise<string> {
  return permanentCacheKey(text, {
    model: "chatterbox",
    voice,
    instructions: JSON.stringify(settings),
  });
}

export interface PermanentCache {
  exists(hash: string): Promise<boolean>;
  get(hash: string): Promise<ArrayBuffer | undefined>;
  save(hash: string, data: ArrayBuffer): Promise<string>;
  getFilePath(hash: string): string;
}
