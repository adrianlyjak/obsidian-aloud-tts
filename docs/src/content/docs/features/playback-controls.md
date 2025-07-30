---
title: Playback Controls
description: Learn how to control audio playback in Aloud TTS.
---

Aloud provides several ways to control audio playback, from starting and stopping to adjusting the speed.

## Starting Playback

There are two primary ways to initiate text-to-speech:

-   **Play Selection**: Highlight any text within a note, open the Command Palette (`Cmd/Ctrl+P`), and run the "**Play selection**" command. You can also right-click on selected text and choose "**Aloud Text To Speech: Play selection**" from the context menu.
-   **Play from Clipboard**: Use the "**Play from clipboard**" command to read text that you have copied from any source.

A player UI will appear at the bottom of the screen when playback begins.

<!-- `[INSERT SCREENSHOT: player_ui.png]` -->

## Player UI

The player UI provides the following controls:

-   **Play/Pause Button**: Start or pause the current audio track.
-   **Next/Previous Sentence**: Skip forward or backward by one sentence.
-   **Playback Speed**: A dropdown menu to adjust the playback speed from 0.5x to 2.5x.

## Commands for Playback Control

In addition to the visual player, you can use the following commands from the Command Palette for quick control:

-   `Play/pause`: Toggles playback. If no audio is active, it will attempt to play the current selection.
-   `Stop`: Halts playback completely and closes the player.
-   `Increase playback speed`: Increases the playback rate by 0.1.
-   `Decrease playback speed`: Decreases the playback rate by 0.1.

## Visual Feedback

As audio plays, the plugin will automatically highlight the sentence currently being read, allowing you to follow along in your notes.

<!-- `[INSERT SCREENSHOT: sentence_highlighting.png]`  -->