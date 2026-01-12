---
title: Highlight Colors
description: Customize the text highlight colors used during TTS playback.
---

When playing text, Aloud TTS highlights the currently playing sentence and the surrounding text in the audio chunk. You can customize these highlight colors using Obsidian's CSS snippet feature.

## Default Behavior

By default, Aloud TTS uses purple highlights:
- **Currently playing sentence**: 40% purple (`rgba(var(--color-purple-rgb), 0.4)`)
- **Surrounding text in audio chunk**: 20% purple (`rgba(var(--color-purple-rgb), 0.2)`)

## CSS Classes

Aloud TTS uses three CSS classes for highlighting:

| Class | Description |
|-------|-------------|
| `.tts-cm-playing-now` | The sentence currently being spoken |
| `.tts-cm-playing-before` | Text before the current sentence (within the audio chunk) |
| `.tts-cm-playing-after` | Text after the current sentence (within the audio chunk) |

## Creating a CSS Snippet

To customize the highlight colors:

1. Navigate to your vault folder
2. Open the `.obsidian/snippets` folder (create it if it doesn't exist)
3. Create a new CSS file (e.g., `aloud-tts-highlights.css`)
4. Add your custom styles
5. In Obsidian, go to **Settings → Appearance → CSS snippets**
6. Click the refresh button to detect your new snippet
7. Toggle on your snippet to enable it

## Examples

### High Contrast Highlights

For better visibility, you can use higher contrast colors:

```css
/* High contrast yellow/orange highlights */
.tts-cm-playing-now {
  background-color: rgba(255, 200, 0, 0.6) !important;
}

.tts-cm-playing-before,
.tts-cm-playing-after {
  background-color: rgba(255, 165, 0, 0.3) !important;
}
```

### Using Obsidian Theme Colors

You can use Obsidian's built-in color variables for consistency with your theme:

```css
/* Use theme accent colors */
.tts-cm-playing-now {
  background-color: rgba(var(--color-blue-rgb), 0.5) !important;
}

.tts-cm-playing-before,
.tts-cm-playing-after {
  background-color: rgba(var(--color-red-rgb), 0.3) !important;
}
```

Available Obsidian color variables include:
- `--color-red-rgb`
- `--color-orange-rgb`
- `--color-yellow-rgb`
- `--color-green-rgb`
- `--color-cyan-rgb`
- `--color-blue-rgb`
- `--color-purple-rgb`
- `--color-pink-rgb`

### Remove Highlights Entirely

If you prefer no visual highlighting during playback:

```css
/* Disable all TTS highlights */
.tts-cm-playing-now,
.tts-cm-playing-before,
.tts-cm-playing-after {
  background-color: transparent !important;
}
```

### Highlight Only Current Sentence

To show only the currently playing sentence without highlighting surrounding text:

```css
/* Only highlight the current sentence */
.tts-cm-playing-before,
.tts-cm-playing-after {
  background-color: transparent !important;
}

.tts-cm-playing-now {
  background-color: rgba(var(--color-purple-rgb), 0.5) !important;
}
```

### Dark Mode Specific Styles

You can target dark or light mode specifically:

```css
/* Brighter highlights for dark mode */
.theme-dark .tts-cm-playing-now {
  background-color: rgba(255, 255, 100, 0.4) !important;
}

.theme-dark .tts-cm-playing-before,
.theme-dark .tts-cm-playing-after {
  background-color: rgba(255, 255, 100, 0.15) !important;
}

/* Darker highlights for light mode */
.theme-light .tts-cm-playing-now {
  background-color: rgba(100, 100, 255, 0.4) !important;
}

.theme-light .tts-cm-playing-before,
.theme-light .tts-cm-playing-after {
  background-color: rgba(100, 100, 255, 0.15) !important;
}
```

## Tips

- The `!important` flag is needed to override the plugin's default styles
- Use `rgba()` colors to set transparency (the fourth value, 0-1)
- Test your colors in both light and dark modes
- Lower opacity values (0.2-0.4) work well for background highlights
