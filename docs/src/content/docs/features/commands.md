---
title: Commands Reference
description: A complete reference for all commands available in the Aloud TTS plugin.
---

Aloud TTS can be controlled primarily through the Obsidian Command Palette (`Cmd/Ctrl+P`). Additionally, some common actions are available in the right-click context menu.

<!-- `[INSERT SCREENSHOT: command_palette.png]` -->

## Command Palette

The following commands are available:

| Command                   | Description                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Play selection`          | Starts playback of the currently selected text.                                                         |
| `Play from clipboard`     | Starts playback of the text currently in your system clipboard.                                         |
| `Play/pause`              | Toggles playback of the current audio. If nothing is playing, it will try to play the current selection. |
| `Stop`                    | Halts audio playback completely.                                                                        |
| `Increase playback speed` | Increases the audio playback speed by 0.1x. Maximum speed is 2.5x.                                      |
| `Decrease playback speed` | Decreases the audio playback speed by 0.1x. Minimum speed is 0.5x.                                      |

## Right-Click Context Menu

When you right-click in the editor, the following commands are available under the "Aloud Text To Speech" submenu:

| Command                    | Description                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `Play selection`           | Starts playback of the selected text.                                                             |
| `Paste text to audio`      | Generates audio from the clipboard text and embeds it as an audio file in the note.               |
| `Export selection to audio`| Generates an `.mp3` audio file from the selected text and saves it to your vault.                 |

<!-- `[INSERT SCREENSHOT: context_menu.png]`  -->