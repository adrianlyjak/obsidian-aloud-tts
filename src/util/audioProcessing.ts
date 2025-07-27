import * as lamejs from "@breezystack/lamejs";

export interface PcmToMp3Options {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 8; // lamejs primarily works with 16-bit
  kbps?: number;
}

export async function pcmBufferToMp3Buffer(
  audioArrayBuffer: ArrayBuffer,
  options: PcmToMp3Options,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const kbpsToUse = options.kbps ?? 128;

      if (options.bitDepth !== 16) {
        // lamejs primarily handles 16-bit PCM.
        // If you have 8-bit PCM, it needs conversion to 16-bit first.
        reject(
          new Error(
            `Raw PCM bitDepth ${options.bitDepth} is not directly supported. Please provide 16-bit PCM.`,
          ),
        );
        return;
      }
      if (
        audioArrayBuffer.byteLength %
          (options.channels * (options.bitDepth / 8)) !==
          0 &&
        options.channels > 0
      ) {
        console.warn(
          "Raw PCM ArrayBuffer length is not a perfect multiple of (channels * bytesPerSample). Data might be truncated or padded by ArrayBuffer views if not aligned.",
        );
      }
      if (audioArrayBuffer.byteLength % 2 !== 0 && options.bitDepth === 16) {
        reject(
          new Error(
            "Raw 16-bit PCM ArrayBuffer length must be even to create Int16Array.",
          ),
        );
        return;
      }

      if (options.channels > 2 || options.channels < 1) {
        reject(
          new Error(
            `Unsupported number of channels: ${options.channels}. Only 1 or 2 channels are supported.`,
          ),
        );
        return;
      }

      // The entire buffer is PCM data
      const pcmSamples = new Int16Array(audioArrayBuffer);

      // --- Common MP3 Encoding Logic ---
      if (pcmSamples.length === 0) {
        reject(new Error("PCM data is empty or could not be extracted."));
        return;
      }

      const mp3Encoder = new lamejs.Mp3Encoder(
        options.channels,
        options.sampleRate,
        kbpsToUse,
      );
      const mp3Data: Uint8Array[] = [];
      const sampleBlockSize = 1152; // Standard block size for MP3 encoder

      for (
        let i = 0;
        i < pcmSamples.length;
        i += sampleBlockSize * options.channels
      ) {
        const batchSamples: Int16Array[] = [];
        for (let ch = 0; ch < options.channels; ch++) {
          const channelBuffer = new Int16Array(sampleBlockSize);
          let samplesInChannel = 0;
          for (let s = 0; s < sampleBlockSize; s++) {
            const pcmIdx = i + s * options.channels + ch;
            if (pcmIdx < pcmSamples.length) {
              channelBuffer[s] = pcmSamples[pcmIdx];
              samplesInChannel++;
            } else {
              break;
            }
          }
          // Only push the subarray that contains actual samples
          batchSamples.push(channelBuffer.subarray(0, samplesInChannel));
        }

        let mp3buf: Uint8Array;
        if (options.channels === 1) {
          if (batchSamples[0] && batchSamples[0].length > 0) {
            mp3buf = mp3Encoder.encodeBuffer(batchSamples[0]);
          } else {
            mp3buf = new Uint8Array(0);
          }
        } else {
          const left = batchSamples[0] || new Int16Array(0);
          const right = batchSamples[1] || new Int16Array(0);
          if (left.length > 0 || right.length > 0) {
            mp3buf = mp3Encoder.encodeBuffer(left, right);
          } else {
            mp3buf = new Uint8Array(0);
          }
        }

        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }

      const flushedMp3buf: Uint8Array = mp3Encoder.flush();
      if (flushedMp3buf.length > 0) {
        mp3Data.push(flushedMp3buf);
      }

      if (mp3Data.length === 0) {
        reject(
          new Error(
            "MP3 encoding resulted in no data. Check PCM input and encoder parameters.",
          ),
        );
        return;
      }

      const totalLength = mp3Data.reduce((acc, chunk) => acc + chunk.length, 0);
      const finalMp3Uint8Array = new Uint8Array(totalLength);
      let currentOffset = 0;
      mp3Data.forEach((chunk) => {
        finalMp3Uint8Array.set(chunk, currentOffset);
        currentOffset += chunk.length;
      });

      resolve(finalMp3Uint8Array.buffer);
    } catch (error) {
      console.error("Error during audio to MP3 conversion:", error);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Concatenate multiple MP3 ArrayBuffers into a single MP3 file
 * by decoding to PCM, concatenating, and re-encoding
 */
export async function concatenateMp3Buffers(
  buffers: ArrayBuffer[],
  audioSink: { getAudioBuffer: (audio: ArrayBuffer) => Promise<AudioBuffer> },
): Promise<ArrayBuffer> {
  if (buffers.length === 0) {
    throw new Error("No audio buffers to concatenate");
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  // Decode all MP3 buffers to AudioBuffer (PCM)
  const audioBuffers: AudioBuffer[] = [];
  for (const buffer of buffers) {
    const audioBuffer = await audioSink.getAudioBuffer(buffer);
    audioBuffers.push(audioBuffer);
  }

  // Get audio properties from first buffer
  const sampleRate = audioBuffers[0].sampleRate;
  const numberOfChannels = audioBuffers[0].numberOfChannels;

  // Calculate total length and concatenate PCM data
  const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
  const concatenatedChannels: Float32Array[] = [];

  // Initialize arrays for each channel
  for (let ch = 0; ch < numberOfChannels; ch++) {
    concatenatedChannels[ch] = new Float32Array(totalLength);
  }

  // Copy each buffer's data into the concatenated arrays
  let offset = 0;
  for (const audioBuffer of audioBuffers) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      concatenatedChannels[ch].set(channelData, offset);
    }
    offset += audioBuffer.length;
  }

  // Convert Float32Array to Int16Array (PCM format for lamejs)
  const pcmSamples = new Int16Array(totalLength * numberOfChannels);
  for (let i = 0; i < totalLength; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      // Convert float32 [-1,1] to int16 [-32768,32767]
      const sample = Math.max(-1, Math.min(1, concatenatedChannels[ch][i]));
      pcmSamples[i * numberOfChannels + ch] = Math.round(sample * 32767);
    }
  }

  // Re-encode to MP3
  return await pcmBufferToMp3Buffer(pcmSamples.buffer, {
    sampleRate,
    channels: numberOfChannels,
    bitDepth: 16,
    kbps: 128,
  });
}
