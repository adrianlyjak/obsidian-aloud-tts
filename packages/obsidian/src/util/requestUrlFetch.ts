import { requestUrl } from "obsidian";
import type { HttpFetch } from "open-tts";

/**
 * A fetch-compatible client backed by Obsidian's requestUrl, which bypasses
 * the browser CORS restrictions that block cross-origin fetch calls from the
 * renderer (`app://obsidian.md` on desktop, `capacitor://localhost` on mobile).
 */
export const requestUrlFetch: HttpFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const response = await requestUrl({
    url,
    method: init.method ?? "GET",
    headers: headersToRecord(init.headers),
    body: typeof init.body === "string" ? init.body : undefined,
    throw: false,
  });

  return new Response(response.arrayBuffer, {
    status: response.status,
    headers: response.headers,
  });
};

function headersToRecord(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
  } else {
    Object.assign(result, headers);
  }
  return result;
}
