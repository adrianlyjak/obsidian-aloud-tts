---
title: Configuration
description: A detailed reference for all settings in the Aloud TTS plugin.
---

The Aloud TTS plugin offers a variety of settings to customize your text-to-speech experience. You can access them by navigating to **Settings → Aloud Text To Speech**.

<!-- `[INSERT SCREENSHOT: full_settings_panel.png]` -->

## General Settings

These settings control the core behavior of the plugin.

-   **TTS Provider**: Choose the text-to-speech service you want to use. Each provider offers different voices and pricing. Supported providers include OpenAI, Google Gemini, Hume AI, ElevenLabs, Azure Speech Services, and any OpenAI-compatible API.
-   **Playback Speed**: Adjust the default playback speed. The default is `1.0x`. This can also be adjusted from the player UI.
-   **Audio Folder**: The directory in your vault where exported audio files are saved. The default is `aloud/`.

## Cache Settings

These settings control the audio cache behavior.

-   **Cache Storage**:
    -   `Device`: (Default) Stores audio on your local device's storage (IndexedDB). The cache is not synced across devices.
    -   `Vault`: Stores audio in a `.tts` folder inside your vault. This allows the cache to be synced, but increases your vault's size.
-   **Cache Duration**: How long audio files are kept in the cache before being automatically deleted. The default is 7 days.

## Provider Settings

Each TTS provider has its own specific settings. You only need to configure the provider you have selected.

### OpenAI

-   **API Key**: Your API key from [OpenAI](https://platform.openai.com/api-keys).
-   **Model**: The TTS model to use (e.g., `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`).
-   **Voice**: The voice to use for playback.

### Google Gemini

-   **API Key**: Your API key for the [Gemini API](https://aistudio.google.com/app/apikey).
-   **Model**: The Gemini model to use.
-   **Voice**: The voice to use for playback.

### Hume AI

-   **API Key**: Your API key from [Hume AI](https://beta.hume.ai/playground?modal=api-keys).
-   **Voice**: The Hume AI voice to use.

### OpenAI-Compatible API

For users who self-host a TTS service or use a third-party provider with an OpenAI-compatible API.

-   **API Key**: The API key for your service.
-   **API Base URL**: The URL of your API endpoint (e.g., `http://localhost:8020/v1`).
-   **Model**: The name of the model your service uses.
-   **Voice**: The name of the voice to use. 

### ElevenLabs

-   **API Key**: Your API key from [ElevenLabs](https://elevenlabs.io/app/settings/api-keys).
-   **Model**: One of the supported ElevenLabs TTS models (e.g., `eleven_multilingual_v2`, `eleven_flash_v2.5`).
-   **Voice**: The ElevenLabs voice ID to use.
-   **Stability**: Controls how stable/consistent the voice is (0–1).
-   **Similarity Boost**: Controls how closely the output matches the base voice (0–1).
-   **Context Mode**: Optionally include previous sentences for continuity.

### Azure Speech Services

-   **API Key**: Your Azure Speech Services API key.
-   **Region**: Your Azure Speech resource region (e.g., `eastus`).
-   **Voice**: The Azure voice to use (e.g., `en-US-JennyNeural`).
-   **Output Format**: Select the desired audio format (e.g., MP3/WAV variants).