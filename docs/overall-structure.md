# Overall Architecture

This document outlines the overall structure and architecture of the Obsidian TTS plugin.

## High-Level Architecture

The plugin follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Obsidian      │    │   Settings &    │    │  Audio System   │
│   Integration   │◄──►│   UI Layer      │◄──►│   (Core)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ React Components│    │  TTS Models     │
                       │    (Settings)   │    │   (Providers)   │
                       └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Plugin Entry Point
**File**: `src/obsidian/TTSPlugin.ts`
- **Role**: Main Obsidian plugin class that orchestrates everything
- **Key Responsibilities**:
  - Initializes the audio system and all dependencies
  - Registers Obsidian commands and UI elements
  - Sets up right-click menu integration
  - Manages plugin lifecycle (load/unload)
  - Creates the dependency injection container via `AudioSystem`

### 2. Audio System (Core Engine)
**Primary Files**:
- `src/player/AudioSystem.ts` - Dependency injection container
- `src/player/AudioStore.ts` - High-level audio state management
- `src/player/AudioSink.ts` - Low-level audio playback interface
- `src/player/ActiveAudioText.ts` - Manages active text being played
- `src/player/ChunkPlayer.ts` - Handles audio chunk sequencing
- `src/player/ChunkLoader.ts` - Preloads audio chunks for smooth playback

**Architecture**:
The audio system uses a dependency injection pattern where `AudioSystem` acts as a service locator. Key components:

- **AudioStore**: Top-level controller that manages the currently active audio session
- **ActiveAudioText**: Represents a specific text selection being played, manages chunking and playback state
- **AudioSink**: Abstraction over Web Audio API that handles actual audio playback
- **ChunkPlayer**: Orchestrates the loading and playing of individual audio chunks
- **ChunkLoader**: Background service that preloads upcoming audio chunks

**Text Processing Flow**:
1. Text is split into chunks (sentences or paragraphs based on settings)
2. Each chunk becomes an `AudioTextChunk` with start/end positions
3. `ChunkLoader` converts chunks to audio via TTS models
4. `AudioSink` handles seamless playback of chunked audio

### 3. Settings Management
**File**: `src/player/TTSPluginSettings.ts`
- **Role**: Centralized settings store using MobX for reactivity
- **Key Features**:
  - Model-specific configuration (OpenAI, Azure, ElevenLabs, etc.)
  - Settings persistence and migration
  - API key validation
  - Default values and type safety

### 4. TTS Model Abstraction
**Directory**: `src/models/`
**Key Files**:
- `tts-model.ts` - Common interface for all TTS providers
- `registry.ts` - Registry of available models
- Provider implementations: `openai.ts`, `azure.ts`, `elevenlabs.ts`, `gemini.ts`, `hume.ts`, `openai-like.ts`

**Architecture**:
- **TTSModel Interface**: Unified API for text-to-speech conversion
- **Registry Pattern**: Central lookup for model providers
- **Options Conversion**: Each provider converts settings to standardized options
- **Validation**: Built-in connection validation for each provider

### 5. Obsidian Integration
**Files**:
- `src/obsidian/ObsidianBridge.ts` - Bridge between Obsidian and audio system
- `src/codemirror/TTSCodemirror.ts` - CodeMirror editor integration

**ObsidianBridge Responsibilities**:
- Editor state tracking (active/focused editors)
- Text selection handling
- Audio export functionality
- Integration with Obsidian's file system

**CodeMirror Integration**:
- Visual highlighting of currently playing text
- Real-time text change detection and handling
- Player panel UI integration
- MobX-based reactive updates

### 6. React UI Components
**Directory**: `src/components/`
**Key Areas**:

**Settings UI** (`settings/` subdirectory):
- Provider-specific setting panels
- API key components with validation
- Option selectors and form controls

**Player UI**:
- `PlayerView.tsx` - Main player controls
- `AudioVisualizer.tsx` - Real-time audio visualization
- `DownloadProgress.tsx` - Loading indicators

**Obsidian Integration**:
- `TTSPluginSettingsTab.tsx` - Obsidian settings tab wrapper
- Custom panels and widgets

### 7. Utility Layer
**Directory**: `src/util/`
**Key Files**:
- `misc.ts` - Text splitting functions (sentences, paragraphs)
- `cleanMarkdown.ts` - Markdown text processing
- `audioProcessing.ts` - Audio format conversion utilities
- `Minhash.ts` - Content hashing for caching

## Data Flow

### Text-to-Audio Pipeline
1. **Text Input**: User selects text or triggers clipboard reading
2. **Text Processing**: 
   - Clean markdown formatting
   - Split into chunks (sentences/paragraphs)
   - Create `AudioTextChunk` objects with position metadata
3. **Audio Generation**:
   - `ChunkLoader` processes chunks through selected TTS model
   - Audio data cached using content hashes
4. **Playback**:
   - `AudioSink` manages Web Audio API
   - `ChunkPlayer` sequences chunk playback
   - Real-time highlighting in CodeMirror

### Settings Management Flow
1. **Loading**: Settings loaded from Obsidian's data store
2. **Migration**: Automatic schema migration for version updates
3. **Validation**: Real-time API key validation
4. **Persistence**: Debounced saves to Obsidian data store
5. **Reactivity**: MobX observables trigger UI updates

### Editor Integration Flow
1. **Selection Detection**: ObsidianBridge tracks editor state
2. **Text Changes**: CodeMirror extension detects document changes
3. **State Synchronization**: MobX reactions sync player state to editor
4. **Visual Updates**: Decorations highlight playing text
5. **User Interaction**: Commands and menus trigger audio actions

## Key Patterns

### Dependency Injection
The `AudioSystem` uses a proxy-based lazy loading pattern for dependency injection, ensuring clean separation of concerns and testability.

### Observer Pattern (MobX)
Extensive use of MobX for reactive state management across:
- Settings changes
- Audio playback state
- Editor synchronization
- UI updates

### Registry Pattern
TTS models are registered in a central registry, allowing easy addition of new providers without modifying core code.

### Command Pattern
Obsidian commands encapsulate audio actions, providing consistent keyboard shortcuts and menu integration.

## Storage and Caching

### Audio Cache
- Content-addressed storage using MinHash
- Configurable cache duration and location
- Background cleanup of expired content

### Settings Persistence
- JSON-based storage through Obsidian's data API
- Automatic migration between schema versions
- Validation and defaults for missing fields

## Performance Considerations

### Background Loading
- `ChunkLoader` preloads upcoming audio chunks
- Configurable background processing intervals
- Cancellable promises for clean resource management

### Memory Management
- Automatic cleanup of completed audio sessions
- Disposal patterns for MobX observers
- Web Audio API resource management

### Streaming Playback
- Chunked audio allows for immediate playback start
- MediaSource Extensions for seamless audio streaming
- Adaptive loading based on playback position 