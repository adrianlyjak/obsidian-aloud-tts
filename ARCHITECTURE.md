# Big Goal

-   tts is chunked along sentence and/or paragraph boundaries
-   sentence/paragraph is highlighted while its being read
-   text is sent incrementally to openAI, and just in time so that it has closer to real-time reading speed
-   you can pause and play the text
-   there's an audio player view that shows near the currently playing section

-   there's a local cache of text to audio
-   this cache is read from disk on startup
-   this cache gets flushed to disk intermittently and on shut-down
-   there's a garbage collection process that throws out persisted text that no longer exists in the document
