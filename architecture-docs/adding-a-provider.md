### Adding a new Audio Provider

Add a provider end-to-end in five steps: types → model → registry → settings UI → tests.

High level:
- Settings: `src/player/TTSPluginSettings.ts`
- Provider client: `src/models/<provider>.ts` (implements `TTSModel`)
- Registry dispatch: `src/models/registry.ts`
- Settings UI: `src/components/settings/providers/provider-<provider>.tsx` + `TTSSettingsTabComponent.tsx`

---

### 1) Add strongly-typed settings for your provider

Edit `src/player/TTSPluginSettings.ts`:
- Extend `TTSPluginSettings` with a dedicated `FooModelConfig` interface and include it in the intersection type of `TTSPluginSettings`.
- Add your provider key to `modelProviders`.
- Add default values to `DEFAULT_SETTINGS`.

Example (replace `foo` with your provider id):

```ts
// Add interface
export interface FooModelConfig {
  foo_apiKey: string;
  foo_model: string;         // optional depending on provider
  foo_voice: string;         // optional if provider requires a named voice
  foo_contextMode: boolean;  // optional
}

// Add to TTSPluginSettings union
export type TTSPluginSettings = {
  // existing fields...
} & (/* existing configs */ & FooModelConfig);

// Add to providers list (string literal union)
export const modelProviders = [
  // existing providers...
  "foo",
] as const;

// Add defaults
export const DEFAULT_SETTINGS: TTSPluginSettings = {
  // existing defaults...
  foo_apiKey: "",
  foo_model: "",
  foo_voice: "",
  foo_contextMode: false,
  // keep version and other defaults as-is
};
```

Notes
- Always type fields explicitly. Prefer clear names (`<provider>_apiKey`, `<provider>_voice`, etc.).
- Only add the fields the provider actually needs. Frequently providers have differing needs, so you may need to add new types of settings for the new provider.

---

### 2) Implement the provider client (`src/models/foo.ts`)

Create a new file `src/models/foo.ts` that exports a `fooTextToSpeech: TTSModel` and any helper functions you need. Follow the shape used by existing providers:

```ts
import { TTSPluginSettings } from "../player/TTSPluginSettings";
import { ErrorMessage, REQUIRE_API_KEY, TTSErrorInfo, TTSModel, TTSModelOptions } from "./tts-model";

export const fooTextToSpeech: TTSModel = {
  call: fooCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.foo_apiKey) return REQUIRE_API_KEY;
    return await validateApiKeyFoo(settings.foo_apiKey);
  },
  convertToOptions: (settings): TTSModelOptions => ({
    apiKey: settings.foo_apiKey,
    voice: settings.foo_voice,   // omit if not needed
    model: settings.foo_model,
    contextMode: settings.foo_contextMode,
  }),
};

export async function fooCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  contexts: string[],
  settings: TTSPluginSettings,
): Promise<ArrayBuffer> {
  // Build request according to provider API
  // Example POST with JSON body
  const resp = await fetch("https://api.foo.com/v1/tts", {
    method: "POST",
    headers: { "Authorization": `Bearer ${options.apiKey ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model: options.model, voice: options.voice }),
  });
  await validate200Foo(resp);
  return await resp.arrayBuffer();
}

export async function validateApiKeyFoo(apiKey: string): Promise<string | undefined> {
  try {
    const resp = await fetch("https://api.foo.com/v1/me", { headers: { Authorization: `Bearer ${apiKey}` } });
    await validate200Foo(resp);
    return undefined;
  } catch (err) {
    if (err instanceof TTSErrorInfo) {
      if (err.httpErrorCode === 401) return "Invalid API key";
      if (err.httpErrorCode !== undefined) return `HTTP error code ${err.httpErrorCode}: ${err.ttsJsonMessage() || err.message}`;
      return err.ttsJsonMessage() || err.message;
    }
    return "Cannot connect to Foo API";
  }
}

async function validate200Foo(response: Response) {
  if (response.status >= 300) {
    let errorMessage: ErrorMessage | undefined;
    try {
      const json = await response.json();
      errorMessage = { error: { message: json?.error?.message || "Unknown error", type: json?.error?.type || "foo_error", code: String(response.status), param: null } };
    } catch {}
    throw new TTSErrorInfo(`HTTP ${response.status} error`, errorMessage, response.status);
  }
}
```

Notes
- Use `TTSErrorInfo` for HTTP errors so messages render consistently in the UI.
- If you need to list voices/models, add helpers like `listFooVoices`, `listFooModels`.

---

### 3) Register the provider (`src/models/registry.ts`)

Import and add to the map keyed by your provider id. This wires the runtime to call your client.

```ts
import { fooTextToSpeech } from "./foo";

export const REGISTRY: Record<ModelProvider, TTSModel> = {
  // existing entries...
  foo: fooTextToSpeech,
};
```

If your provider requires a named voice, and you need custom behavior, consider `hasNamedVoice` (see earlier versions). Most providers now use a generic test phrase instead.

---

### 4) Add the settings UI

Create `src/components/settings/providers/provider-foo.tsx` to edit `foo_*` fields. Typical controls:
- `ApiKeyComponent` for API key (optionally validate)
- `OptionSelectSetting` for models/voices (populate via API)
- `CheckboxSetting`, `TextInputSetting`, `TextareaSetting` as needed

```tsx
import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "../../../player/TTSPluginSettings";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, CheckboxSetting } from "../setting-components";

export const FooSettings = observer(({ store }: { store: TTSPluginSettingsStore }) => {
  return (
    <>
      <ApiKeyComponent
        store={store}
        provider="foo"
        fieldName="foo_apiKey"
        displayName="Foo API key"
        helpText={<>Enter your Foo API key.</>}
        showValidation={true}
      />
      <OptionSelectSetting
        name="Model"
        description="Choose a model"
        store={store}
        provider="foo"
        fieldName="foo_model"
        options={[{ label: "Default", value: "default" }]}
      />
      <CheckboxSetting
        name="Context Mode"
        description="Use previous sentences as context"
        store={store}
        provider="foo"
        fieldName="foo_contextMode"
      />
    </>
  );
});
```

Wire it in `src/components/TTSSettingsTabComponent.tsx` by:
- Adding a label for your key in the `labels` map
- Conditionally rendering `<FooSettings />` when selected
- Ensuring `modelProviders` includes your key

---

### 5) Tests for the provider (`src/models/foo.test.ts`)

Write unit tests with Vitest:
- `convertToOptions` maps settings correctly
- `validateConnection` returns clear messages (invalid key, network errors)
- `call` performs the correct request and handles success/error
- Any listing helpers (voices/models) work and map provider responses to simple arrays

Skeleton:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fooTextToSpeech, fooCallTextToSpeech } from "./foo";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

global.fetch = vi.fn();

describe("Foo TTS", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("convertToOptions maps settings", () => {
    const s = { ...DEFAULT_SETTINGS, foo_apiKey: "k", foo_model: "m" } as const;
    expect(fooTextToSpeech.convertToOptions(s)).toMatchObject({ apiKey: "k", model: "m" });
  });

  it("call returns audio buffer", async () => {
    const buf = new ArrayBuffer(4);
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, arrayBuffer: vi.fn().mockResolvedValue(buf) } as any);
    const opts = fooTextToSpeech.convertToOptions({ ...DEFAULT_SETTINGS, foo_apiKey: "k" } as any);
    const out = await fooCallTextToSpeech("hi", opts, [], DEFAULT_SETTINGS);
    expect(out).toBe(buf);
  });
});
```

Testing guidelines
- Always type function arguments and return values.
- Prefer simple data and helpers over heavy mocking; mock `fetch` at the boundary.
- Avoid repeated patches in tests; extract helpers/fixtures when repeated.

---

### Common pitfalls
- Missing default settings or union update: ensure `modelProviders` includes your key and `DEFAULT_SETTINGS` initializes your fields.
- Unclear error surface: wrap HTTP errors in `TTSErrorInfo` so the UI shows actionable messages.
- Voice requirements: if your API requires a `voice`, expose a voice selector in the provider settings and validate accordingly.

---

### Minimal checklist
- Add typed settings fields + defaults in `TTSPluginSettings.ts`
- Implement `src/models/foo.ts` with `TTSModel`
- Register in `src/models/registry.ts`
- Add settings UI component and render it in `TTSSettingsTabComponent.tsx`
- Add tests in `src/models/foo.test.ts`

---

### Keep end-user docs up to date

After adding a provider or changing required fields, update the docs so users can configure it:
- Edit `docs/src/content/docs/configuration.md` to add/update a section for your provider with its required fields (API key, model/voice names, any special options like region/output format/context).
- If screenshots change, update images under `docs/public/` and the README settings screenshot if needed.


