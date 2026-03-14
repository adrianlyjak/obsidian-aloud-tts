# Proposal: Device-Local Settings for Platform-Specific Configs

## Problem

The `feat/aws-profile-auth` branch adds AWS profile authentication for Polly. This requires reading `~/.aws/credentials` which only works on desktop (Node.js).

Two issues:
1. Settings sync across devices - if you configure profile auth on desktop, it syncs to mobile where it won't work
2. The provider code (`src/models/polly.ts`) shouldn't import from `obsidian` - that breaks the platform-agnostic architecture

## Key Insight

**Providers should never need to check the platform.** By the time settings reach the provider, they should already be resolved to work on the current device.

The settings/UI layer (which CAN import from `obsidian`) handles:
- Platform detection via `Platform.isDesktopApp`
- Reading AWS profile credentials on desktop
- Storing device-local settings in IDB
- Passing resolved credentials to the provider

The provider just receives `accessKeyId` and `secretAccessKey` - it doesn't care where they came from.

## Implementation

### 1. Device-Local Settings in IDB

Store platform-specific settings in IndexedDB (not synced):

```typescript
interface DeviceLocalSettings {
  polly_authMode: "static" | "profile";
  polly_profile: string;
  polly_refreshCommand: string;
}
```

### 2. Settings Resolution at the Obsidian Layer

In `src/obsidian/` or `src/components/settings/`, before passing settings to the provider:

```typescript
// This code CAN import from obsidian
import { Platform } from "obsidian";

async function resolvePollyCredentials(
  syncedSettings: TTSPluginSettings,
  deviceSettings: DeviceLocalSettings,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> {

  // If static mode or not on desktop, use synced static credentials
  if (deviceSettings.polly_authMode === "static" || !Platform.isDesktopApp) {
    return {
      accessKeyId: syncedSettings.polly_accessKeyId,
      secretAccessKey: syncedSettings.polly_secretAccessKey,
    };
  }

  // Profile mode on desktop - read from ~/.aws/credentials
  const creds = await readProfileCredentials(deviceSettings.polly_profile);
  if (creds) {
    return creds;
  }

  // Fallback to static if profile read fails
  return {
    accessKeyId: syncedSettings.polly_accessKeyId,
    secretAccessKey: syncedSettings.polly_secretAccessKey,
  };
}
```

### 3. Provider Stays Platform-Agnostic

The Polly provider (`src/models/polly.ts`) just uses whatever credentials it receives:

```typescript
// NO imports from 'obsidian' here!

export const pollyTextToSpeech: TTSModel = {
  validateConnection: async (settings) => {
    // Just check if we have credentials - don't care where they came from
    if (!settings.polly_accessKeyId || !settings.polly_secretAccessKey) {
      return REQUIRE_API_KEY;
    }
    // ... validate with AWS
  },

  call: async (text, options, settings) => {
    // Use the credentials directly
    const client = new PollyClient({
      credentials: {
        accessKeyId: settings.polly_accessKeyId,
        secretAccessKey: settings.polly_secretAccessKey,
        sessionToken: settings.polly_sessionToken,
      },
      region: settings.polly_region,
    });
    // ...
  },
};
```

### 4. Settings UI (Obsidian-Aware)

The settings UI in `src/components/settings/providers/provider-polly.tsx`:

```typescript
import { Platform } from "obsidian";

// Only show profile auth option on desktop
const showProfileAuth = Platform.isDesktopApp;

// When authMode changes, resolve credentials immediately
// and update the effective settings
```

## Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Obsidian Layer (can use Platform)                          │
│                                                             │
│  1. Load device-local settings from IDB                     │
│  2. If profile mode + desktop: read ~/.aws/credentials      │
│  3. Merge resolved creds into effective settings            │
│  4. Pass to AudioSystem                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Provider Layer (platform-agnostic)                         │
│                                                             │
│  - Receives settings with accessKeyId/secretAccessKey       │
│  - Doesn't know or care if they came from static or profile │
│  - Just uses them                                           │
└─────────────────────────────────────────────────────────────┘
```

## Settings Split

**Synced (Obsidian plugin data):**
- `polly_accessKeyId`, `polly_secretAccessKey` (static credentials)
- `polly_region`, `polly_voiceId`, `polly_engine`

**Device-Local (IDB):**
- `polly_authMode`
- `polly_profile`
- `polly_refreshCommand`

**Resolved at runtime (not stored):**
- Effective `accessKeyId`/`secretAccessKey` when using profile mode

## What Changes in feat/aws-profile-auth

The `aws-profile.ts` file with `readProfileCredentials()` and `runRefreshCommand()` is fine - those utilities just need to move to or be called from the Obsidian layer, not from the provider.

The provider code should be simplified to just use credentials from settings, with no `Platform` checks.
