import { describe, it, expect, beforeEach, vi } from "vitest";
import { requestUrl } from "obsidian";
import { requestUrlFetch } from "./requestUrlFetch";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

describe("requestUrlFetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a fetch call onto requestUrl and returns a Response", async () => {
    const body = new TextEncoder().encode('{"ok":true}');
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      arrayBuffer: body.buffer,
    } as any);

    const response = await requestUrlFetch(
      "https://api.speechify.ai/v1/voices?limit=1",
      {
        method: "GET",
        headers: { Authorization: "Bearer key" },
      },
    );

    expect(requestUrl).toHaveBeenCalledWith({
      url: "https://api.speechify.ai/v1/voices?limit=1",
      method: "GET",
      headers: { Authorization: "Bearer key" },
      body: undefined,
      throw: false,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("defaults to GET and supports URL and Headers inputs", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
    } as any);

    await requestUrlFetch(new URL("https://api.speechify.ai/v1/audio/models"), {
      headers: new Headers({ "X-Test": "yes" }),
    });

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.speechify.ai/v1/audio/models",
        method: "GET",
        headers: { "x-test": "yes" },
      }),
    );
  });

  it("passes string bodies through", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
    } as any);

    await requestUrlFetch("https://api.speechify.ai/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "hello" }),
    });

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        body: '{"input":"hello"}',
      }),
    );
  });
});
