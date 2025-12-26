# Aloud Text To Speech Obsidian Plugin

Highlight and speak text from your Obsidian notes. Converts text to audio using lifelike voices from various providers.

<video src="https://github.com/adrianlyjak/obsidian-aloud-tts/assets/2024018/6e673350-0cf2-4820-bca1-3f36cd3a24f6" ></video>

Just add your API key from a supported provider. Choose from available voices.

<img alt="Settings View" src="./docs/public/settings-example.png" width="400p" ></img>

### Supported TTS Models:

*   **OpenAI:** (e.g., `tts-1`, `tts-1-hd`, `gpt-4o-mini`). OpenAI charges Audio at [$0.015 per 1,000 characters](https://openai.com/pricing).
*   **Google Gemini:** (Gemini 2.5 series)
*   **Hume AI:** (Hume voices with customization)
*   **ElevenLabs:** (Model selection, voice selection, stability/similarity options)
*   **Azure Speech Services:** (Region, voice and output format selection)
*   **MiniMax:** (speech-2.6-hd, speech-2.6-turbo, speech-02-hd, speech-02-turbo, speech-01-hd, speech-01-turbo)
*   **AWS Polly:** (Region, voice, neural/standard engine, output format)

You can also configure a custom API endpoint if you have an OpenAI compatible API server that has an `/v1/audio/speech` endpoint. For example [openedai-speech](https://github.com/matatonic/openedai-speech).

### Features:

**Visual Feedback:** Active sentence is highlighted and updated as playback progresses.

**Listen immediately:** Audio is streamed sentence-by-sentence. Jump back and forth by skipping by sentence.

**Variable Speeds:** On device playback rate adjustor for improved audio quality.

<img src="docs/public/variable-speeds.png" width="200" ></img>

**Caching:** Audio is cached in your vault to reduce costs, and automatically removed. Cache duration is configurable. Audio may be cached device local or in a vault directory.

<img src="docs/public/cache-settings.png" width="400" ></img>

**Export and Embed Audio:** Quickly export to audio files: export audio files from selection, or embed audio by pasting text from your clipboard.

<img src="docs/public/right-click-menu.png" max="300" ></img>

**Play text from anywhere:** Lots of commands. Play text to speech directly from your clipboard.

<img src="docs/public/commands.png" width="300" ></img>

**OS Integration:** Integrates with your mobile phone to play while locked. Pause/Play with OS controls on desktop.

### Alternate TTS Models

You can also run alternate models if you have an OpenAI‑compatible API server that exposes `/v1/audio/speech` (for example, `openedai-speech`). Configure the URL and API key in the plugin settings under “OpenAI Compatible (Advanced)”.
