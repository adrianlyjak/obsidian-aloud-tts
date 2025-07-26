# Audio Sink Rearchitecture Analysis

## Current Architecture Problems

### 1. **Multi-Layer State Synchronization Issues**

The current system has 4 layers of state that can get out of sync:
1. **Logical Chunks** (`AudioTextChunk[]`) - high-level text segments with duration tracking
2. **ChunkPlayer** - manages loading/sequencing logic with `offsetDuration` calculations  
3. **AudioSink** - manages HTMLAudioElement and playback
4. **SourceBuffer** - low-level browser audio timeline

**Problem**: When text is edited, layers 1-2 are properly invalidated, but layer 4 (SourceBuffer) still contains old audio data at those timeline positions. The existing `offsetDuration` calculations in ChunkPlayer are correct but not used to manage SourceBuffer timeline integrity.

### 2. **SourceBuffer Timeline Corruption**

#### Text Editing Bug
```typescript
// onMultiTextChanged.ts - when text changes
track.audio = undefined;        // ✅ Logical chunk invalidated
track.audioBuffer = undefined;  // ✅ Decoded buffer cleared
track.duration = undefined;     // ✅ Duration invalidated

// ChunkPlayer.ts - duration recalculation works correctly
const offsetDuration = activeText.audio.chunks
  .slice(0, position)
  .reduce((acc, x) => acc + (x.duration || 0), 0);

// ❌ But SourceBuffer timeline still contains old audio at these positions!
```

This creates a "zombie audio" scenario where:
- Logical state correctly recalculates durations and positions
- SourceBuffer timeline position for chunk A still has old audio data
- When new chunk loads, `timestampOffset` becomes misaligned with logical state
- Result: `A, B, A, C, D, E` playback pattern (old A audio plays instead of C)

#### iOS Safari Specific Issues
- `buffered.end()` returns stale values during rapid `appendBuffer`/`remove` operations
- `timestampOffset` calculations become unreliable under concurrent operations
- MediaSource API state transitions behave differently than desktop Chrome
- Race conditions between `remove()` and `appendBuffer()` calls

### 3. **Voice Switching Race Conditions**

```typescript
// Settings change flow:
1. Voice setting changes
2. ChunkPlayer._activate() detects change → toReset = { all: true }
3. _clearAudio() called
4. AudioSink.clearMedia() starts async SourceBuffer clearing
5. ❌ Brief moment where old audio can still play before clear completes
6. New voice audio starts loading and gets appended
7. ❌ Potential timeline corruption if old audio not fully cleared
```

**Root cause**: `clearMedia()` is async but not properly awaited by all callers, creating windows where old and new audio coexist in SourceBuffer.

### 4. **Architectural Mismatch with Existing Duration Tracking**

Current ChunkPlayer already has sophisticated duration awareness:
```typescript
// ChunkPlayer.ts already does this correctly:
chunk.setAudioBuffer(buff, offsetDuration); // ✅ Tracks logical timeline position
const duration = loadedChunks.slice(0, index + 1)
  .reduce((acc, x) => acc + (x.duration || 0), 0); // ✅ Accurate duration sums
```

But AudioSink treats SourceBuffer as append-only without using this duration information:
```typescript
// AudioSink.ts - problematic approach
async appendMedia(data: ArrayBuffer): Promise<void> {
  // Only sets timestampOffset based on buffered.end() - ignores logical chunk positions
  this._sourceBuffer.timestampOffset = buffered.end(buffered.length - 1);
  this._sourceBuffer.appendBuffer(data); // Appends without removing old data
}
```

**Reality**: We already have the logical timeline - SourceBuffer operations should align with it.

## Proposed Solutions

### Option 1: **Atomic Timeline Reconstruction**

Leverage existing ChunkPlayer duration tracking to rebuild SourceBuffer timeline when corruption is detected:

```typescript
interface ChunkTimelineEntry {
  index: number;
  data: ArrayBuffer;
  logicalStart: number;  // From ChunkPlayer offsetDuration calculations
  logicalEnd: number;
  codec: string;         // Support multiple audio formats
}

class AtomicTimelineAudioSink implements AudioSink {
  private chunkRegistry = new Map<number, ChunkTimelineEntry>();
  private needsRebuild = false;
  
  async appendMedia(data: ArrayBuffer, chunkIndex: number, logicalStart: number): Promise<void> {
    // Store chunk with its logical timeline position
    const audioBuffer = await this.getAudioBuffer(data);
    const logicalEnd = logicalStart + audioBuffer.duration;
    
    this.chunkRegistry.set(chunkIndex, {
      index: chunkIndex,
      data,
      logicalStart,
      logicalEnd,
      codec: this.detectCodec(data)
    });
    
    if (this.needsRebuild || this.detectTimelineCorruption()) {
      await this.rebuildEntireTimeline();
      this.needsRebuild = false;
    } else {
      await this.appendChunkAtPosition(data, logicalStart);
    }
  }
  
  private async rebuildEntireTimeline(): Promise<void> {
    // Preserve user interaction context for audio initialization
    const wasPlaying = !this._audio.paused;
    const currentTime = this._audio.currentTime;
    
    // Clear everything
    await this.clearSourceBuffer();
    
    // Re-append all chunks in logical order
    const sortedChunks = Array.from(this.chunkRegistry.values())
      .sort((a, b) => a.logicalStart - b.logicalStart);
    
    for (const chunk of sortedChunks) {
      await this.appendChunkAtPosition(chunk.data, chunk.logicalStart);
    }
    
    // Restore playback state
    this._audio.currentTime = currentTime;
    if (wasPlaying) this._audio.play();
  }
  
  markChunkInvalid(chunkIndex: number): void {
    this.chunkRegistry.delete(chunkIndex);
    this.needsRebuild = true;
  }
}
```

**Pros**: 
- Eliminates timeline corruption completely
- Preserves iOS system player integration
- Supports multiple audio codecs
- Uses existing ChunkPlayer duration logic

**Cons**: 
- Expensive full rebuilds when corruption detected
- Complex state management during rebuilds

### Option 2: **Chunk-Aware Surgical Buffer Management**

Make SourceBuffer operations aware of logical chunk positions, with iOS-specific safeguards:

```typescript
class ChunkAwareAudioSink implements AudioSink {
  private chunkPositions = new Map<number, { start: number; end: number }>();
  private operationQueue = new PromiseQueue(); // Prevent concurrent operations
  
  async appendMedia(data: ArrayBuffer, chunkIndex: number, logicalStart: number): Promise<void> {
    return this.operationQueue.add(async () => {
      // Remove any existing audio for this chunk position first
      await this.removeChunkIfExists(chunkIndex);
      
      // Calculate precise insertion point based on logical timeline
      const audioBuffer = await this.getAudioBuffer(data);
      const duration = audioBuffer.duration;
      
      // iOS Safari: extra validation before SourceBuffer operations
      if (this.isIOSSafari()) {
        await this.waitForSourceBufferStability();
      }
      
      // Insert at precise logical position
      await this.insertChunkAtLogicalPosition(data, logicalStart, duration);
      
      // Track this chunk's position
      this.chunkPositions.set(chunkIndex, {
        start: logicalStart,
        end: logicalStart + duration
      });
      
      // Verify timeline integrity after operation
      await this.validateTimelineIntegrity();
    });
  }
  
  private async removeChunkIfExists(chunkIndex: number): Promise<void> {
    const existing = this.chunkPositions.get(chunkIndex);
    if (existing) {
      if (this._sourceBuffer.buffered.length > 0) {
        this._sourceBuffer.remove(existing.start, existing.end);
        await this.waitForUpdateEnd();
      }
      this.chunkPositions.delete(chunkIndex);
    }
  }
  
  private async insertChunkAtLogicalPosition(data: ArrayBuffer, start: number, duration: number): Promise<void> {
    // Set timestampOffset to logical position, not just buffered.end()
    this._sourceBuffer.timestampOffset = start;
    await this.waitForUpdateEnd();
    
    this._sourceBuffer.appendBuffer(data);
    await this.waitForUpdateEnd();
  }
  
  private async validateTimelineIntegrity(): Promise<void> {
    const expectedDuration = this.calculateExpectedLogicalDuration();
    const actualDuration = this.getActualBufferedDuration();
    
    if (Math.abs(expectedDuration - actualDuration) > 0.1) {
      console.warn('Timeline corruption detected, triggering full rebuild');
      throw new TimelineCorruptionError('Full rebuild required');
    }
  }
}
```

**Pros**: 
- Surgical precision - only affects changed chunks
- Better performance for incremental changes
- Maintains iOS system player integration
- Multi-codec support through MediaSource

**Cons**: 
- Complex timeline position calculations
- Still susceptible to iOS Safari MediaSource quirks
- Requires careful operation sequencing

## Recommended Approach

**Adaptive Timeline Management**: Start with Option 2 (Surgical), fallback to Option 1 (Atomic) when needed

This leverages the existing ChunkPlayer duration tracking while maintaining iOS system player integration:

```typescript
class AdaptiveTimelineAudioSink implements AudioSink {
  private chunkPositions = new Map<number, { start: number; end: number; codec: string }>();
  private chunkRegistry = new Map<number, ChunkTimelineEntry>();
  private operationQueue = new PromiseQueue();
  private corruptionCount = 0;
  private readonly MAX_CORRUPTION_TOLERANCE = 3;
  
  async appendMedia(data: ArrayBuffer, chunkIndex: number, logicalStart: number): Promise<void> {
    return this.operationQueue.add(async () => {
      try {
        // Store chunk data for potential atomic rebuild
        const audioBuffer = await this.getAudioBuffer(data);
        this.chunkRegistry.set(chunkIndex, {
          index: chunkIndex,
          data,
          logicalStart,
          logicalEnd: logicalStart + audioBuffer.duration,
          codec: this.detectCodec(data)
        });
        
        // Attempt surgical approach first (Option 2)
        await this.surgicalAppend(data, chunkIndex, logicalStart, audioBuffer.duration);
        
        // Validate result
        await this.validateTimelineIntegrity();
        this.corruptionCount = 0; // Reset on success
        
      } catch (error) {
        if (error instanceof TimelineCorruptionError) {
          this.corruptionCount++;
          
          if (this.corruptionCount >= this.MAX_CORRUPTION_TOLERANCE) {
            console.warn('Multiple corruption attempts, switching to atomic rebuild');
            await this.atomicRebuildTimeline(); // Option 1 fallback
            this.corruptionCount = 0;
          } else {
            console.warn('Timeline corruption detected, retrying with atomic rebuild');
            await this.atomicRebuildTimeline();
          }
        } else {
          throw error;
        }
      }
    });
  }
  
  private async surgicalAppend(data: ArrayBuffer, chunkIndex: number, logicalStart: number, duration: number): Promise<void> {
    // Remove existing chunk at this position
    const existing = this.chunkPositions.get(chunkIndex);
    if (existing) {
      if (this._sourceBuffer.buffered.length > 0) {
        this._sourceBuffer.remove(existing.start, existing.end);
        await this.waitForUpdateEnd();
      }
    }
    
    // iOS Safari specific stability check
    if (this.isIOSSafari()) {
      await this.waitForSourceBufferStability();
    }
    
    // Insert at logical position
    this._sourceBuffer.timestampOffset = logicalStart;
    await this.waitForUpdateEnd();
    
    this._sourceBuffer.appendBuffer(data);
    await this.waitForUpdateEnd();
    
    // Track position
    this.chunkPositions.set(chunkIndex, {
      start: logicalStart,
      end: logicalStart + duration,
      codec: this.detectCodec(data)
    });
  }
  
  private async atomicRebuildTimeline(): Promise<void> {
    // Preserve user interaction context (crucial for audio permission)
    const wasPlaying = !this._audio.paused;
    const currentTime = this._audio.currentTime;
    const playbackRate = this._audio.playbackRate;
    
    // Complete SourceBuffer reset
    await this.clearSourceBuffer();
    this.chunkPositions.clear();
    
    // Re-add all chunks in logical order
    const sortedChunks = Array.from(this.chunkRegistry.values())
      .sort((a, b) => a.logicalStart - b.logicalStart);
    
    // Support multiple codecs: group by codec and handle separately if needed
    const codecGroups = this.groupChunksByCodec(sortedChunks);
    
    for (const [codec, chunks] of codecGroups.entries()) {
      await this.rebuildCodecGroup(codec, chunks);
    }
    
    // Restore exact playback state to maintain user interaction context
    this._audio.currentTime = currentTime;
    this._audio.playbackRate = playbackRate;
    if (wasPlaying) {
      await this._audio.play(); // Await to handle potential permission issues
    }
  }
  
  // Integration point with existing ChunkPlayer
  markChunkInvalid(chunkIndex: number): void {
    this.chunkRegistry.delete(chunkIndex);
    this.chunkPositions.delete(chunkIndex);
    // Don't immediately trigger rebuild - let it happen on next append
  }
  
  // Called from ChunkPlayer when text changes invalidate chunks
  onTextChanged(affectedChunkIndexes: number[]): void {
    for (const index of affectedChunkIndexes) {
      this.markChunkInvalid(index);
    }
  }
}
```

**Integration with existing ChunkPlayer**:
```typescript
// Modify ChunkPlayer.ts to pass logical timeline information
const offsetDuration = activeText.audio.chunks
  .slice(0, position)
  .reduce((acc, x) => acc + (x.duration || 0), 0);

// Pass logical start time to AudioSink
await system.audioSink.appendMedia(result, position, offsetDuration);

// Notify AudioSink when text changes
system.audioSink.onTextChanged(affectedChunkIndexes);
```

This approach provides:
- **iOS system integration** - maintains MediaSource API for native control
- **Multi-codec support** - handles different audio formats appropriately  
- **Performance optimization** - surgical updates when possible, atomic when necessary
- **Corruption resilience** - automatic detection and recovery
- **User interaction preservation** - careful handling of audio permission context

## Implementation Priority

### Phase 1: **Foundation** (1-2 weeks)
1. Modify AudioSink interface to accept `logicalStart` parameter
2. Add operation queuing to prevent race conditions  
3. Implement basic timeline corruption detection
4. Update ChunkPlayer to pass duration information to AudioSink

### Phase 2: **Surgical Operations** (2-3 weeks)  
1. Implement chunk-aware remove/append operations
2. Add iOS Safari specific stability checks
3. Create comprehensive timeline validation
4. Test with existing MP3 codec

### Phase 3: **Atomic Rebuild** (2-3 weeks)
1. Implement full timeline reconstruction with state preservation
2. Add multi-codec support and codec-aware rebuilding  
3. Comprehensive error handling and recovery
4. Performance optimization for large chunk sets

### Phase 4: **Integration & Polish** (1-2 weeks)
1. Integration with text change monitoring from ChunkPlayer
2. Comprehensive testing across platforms (especially iOS Safari)
3. Performance profiling and optimization
4. Edge case handling and stability improvements

This staged approach builds from the existing duration tracking infrastructure while maintaining all current functionality and iOS system integration. 