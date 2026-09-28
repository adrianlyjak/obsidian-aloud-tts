/**
 * Fetch-compatible HTTP client used by TTS providers.
 *
 * Most platforms can use the global fetch directly, but some (like Obsidian)
 * cannot make cross-origin requests, and must route requests through their own
 * HTTP client instead. Platforms can swap the implementation at startup with
 * `setHttpFetch`.
 */
export type HttpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

let httpFetch: HttpFetch = (input, init) => fetch(input, init);

/**
 * Override how providers perform HTTP requests.
 * Returns the previously configured implementation.
 */
export function setHttpFetch(fetchImpl: HttpFetch): HttpFetch {
  const previous = httpFetch;
  httpFetch = fetchImpl;
  return previous;
}

export function getHttpFetch(): HttpFetch {
  return httpFetch;
}
