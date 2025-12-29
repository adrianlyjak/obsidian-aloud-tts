---
title: Getting Started
description: How to install and configure the Obsidian Aloud TTS plugin.
---

## Installation

You can install the plugin either from the Obsidian Community Plugins store or by manually downloading it from GitHub.

### Community Plugins (Recommended)

1.  Open **Settings** in Obsidian.
2.  Go to **Community Plugins**.
3.  Click **Browse** and search for "Aloud".
4.  Click **Install** on "Aloud Text To Speech".
5.  Enable the plugin.

## Initial Configuration

After installing the plugin, you need to configure a TTS provider to enable text-to-speech functionality.

1.  **Open Plugin Settings**: Navigate to **Settings** → **Aloud Text To Speech**.

    <!-- `[INSERT SCREENSHOT: settings_panel_location.png]` -->

2.  **Choose a TTS Provider**: Select a provider from the dropdown menu, such as OpenAI, Google Gemini, Hume AI, or Inworld.

    <!-- `[INSERT SCREENSHOT: provider_selection.png]` -->

3.  **Add Your API Key**: Enter the API key for your chosen provider. You can find this key in your provider's dashboard.

    <!-- `[INSERT SCREENSHOT: api_key_input.png]` -->

4.  **Select a Voice**: Choose a voice from the available options. The list will populate after a valid API key is entered.

    <!-- `[INSERT SCREENSHOT: voice_selection.png]` -->

## Your First Playback

To test your setup:

1.  Open any note in your vault.
2.  Select a portion of text.
3.  Open the Command Palette (`Cmd/Ctrl+P`).
4.  Search for "Speak selection" and run the command.

Audio should begin playing shortly, and the currently spoken sentence will be highlighted in the editor. 