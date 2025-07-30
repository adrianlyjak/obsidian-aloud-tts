---
title: Audio Management
description: Learn about audio caching, exporting, and embedding in Aloud TTS.
---

Aloud includes several features to help you manage audio files, reduce costs, and improve performance.

## Audio Caching

To minimize API usage and speed up playback, Aloud automatically caches the audio it generates. When you request the same text to be spoken again, the plugin will use the cached version instead of contacting the TTS provider.

### Cache Storage Location

You can configure where the audio cache is stored in the plugin settings (**Settings → Aloud Text To Speech → Cache**):

-   **Vault**: Stores audio files in a `.tts` folder within your Obsidian vault. This allows you to sync audio across devices, but will increase the size of your vault.
-   **Device**: Uses IndexedDB to store audio locally on your device. This is the default and does not affect your vault size, but the cache will not be available on other devices.

<!-- `[INSERT SCREENSHOT: cache_settings.png]` -->

### Cache Duration

The cache automatically clears out old files to save space. By default, audio is removed from the cache after 8 hours, but you can configure this duration in the settings.

## Exporting Audio Files

You can export any text selection directly to an `.mp3` file.

1.  Select the text you want to export.
2.  Right-click on the selection.
3.  Choose "**Aloud Text To Speech: Export selection to audio**" from the context menu.

The audio file will be saved to the folder specified in the plugin's settings (default is `tts-audio`).

## Embedding Audio

You can also embed audio directly into your notes. This is useful for saving audio generated from text that you might not want to keep in the note itself.

1.  Copy the text you want to convert to audio to your clipboard.
2.  In a note, right-click and select "**Aloud Text To Speech: Paste text to audio**".

The plugin will generate the audio, save it to your vault, and insert an embedded player at your cursor's location. A loading indicator will be shown while the audio is being generated. 