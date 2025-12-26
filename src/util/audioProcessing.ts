import * as lamejs from "@breezystack/lamejs";
import { MediaFormat } from "../models/tts-model";

export interface PcmToMp3Options {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 8; // lamejs primarily works with 16-bit
  kbps?: number;
}

/**
 * Supported input formats for transcoding to MP3
 */
export type TranscodableFormat = "pcm" | "wav";

export interface TranscodeToMp3Options {
  /** The format of the input audio data */
  inputFormat: TranscodableFormat;
  /** PCM options - required for raw PCM, ignored for WAV (extracted from header) */
  pcmOptions?: PcmToMp3Options;
  /** Target MP3 bitrate in kbps (default: 128) */
  kbps?: number;
}

/**
 * Transcode audio data from various formats to MP3.
 * This is the main entry point for audio transcoding.
 */
export async function transcodeToMp3(
  audioData: ArrayBuffer,
  options: TranscodeToMp3Options,
): Promise<ArrayBuffer> {
  switch (options.inputFormat) {
    case "pcm":
      if (!options.pcmOptions) {
        throw new Error("pcmOptions are required for raw PCM input");
      }
      return pcmBufferToMp3Buffer(audioData, {
        ...options.pcmOptions,
        kbps: options.kbps ?? options.pcmOptions.kbps,
      });
    case "wav":
      return wavBufferToMp3Buffer(audioData, options.kbps);
    default:
      throw new Error(`Unsupported input format: ${options.inputFormat}`);
  }
}

/**
 * Check if a format needs transcoding to MP3
 */
export function needsTranscoding(format: MediaFormat | "pcm"): boolean {
  return format === "pcm" || format === "wav";
}

/**
 * Parse WAV header and extract PCM data with metadata
 */
export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  pcmData: ArrayBuffer;
}

export function parseWavHeader(wavBuffer: ArrayBuffer): WavInfo {
  const view = new DataView(wavBuffer);

  // Check RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (riff !== "RIFF") {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  // Check WAVE format
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );
  if (wave !== "WAVE") {
    throw new Error("Invalid WAV file: missing WAVE format");
  }

  // Find fmt chunk
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < wavBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      // Audio format (1 = PCM)
      const audioFormat = view.getUint16(offset + 8, true);
      if (audioFormat !== 1) {
        throw new Error(
          `Unsupported WAV audio format: ${audioFormat}. Only PCM (1) is supported.`,
        );
      }
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      // Skip byteRate (offset + 16) and blockAlign (offset + 20)
      bitDepth = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    // WAV chunks are word-aligned (2 bytes)
    if (chunkSize % 2 !== 0) {
      offset += 1;
    }
  }

  if (dataOffset === 0 || dataSize === 0) {
    throw new Error("Invalid WAV file: missing data chunk");
  }

  if (channels === 0 || sampleRate === 0 || bitDepth === 0) {
    throw new Error("Invalid WAV file: missing or invalid fmt chunk");
  }

  // Extract PCM data
  const pcmData = wavBuffer.slice(dataOffset, dataOffset + dataSize);

  return {
    sampleRate,
    channels,
    bitDepth,
    pcmData,
  };
}

/**
 * Convert WAV audio buffer to MP3
 */
export async function wavBufferToMp3Buffer(
  wavBuffer: ArrayBuffer,
  kbps?: number,
): Promise<ArrayBuffer> {
  const wavInfo = parseWavHeader(wavBuffer);

  if (wavInfo.bitDepth !== 16) {
    throw new Error(
      `Unsupported WAV bit depth: ${wavInfo.bitDepth}. Only 16-bit is supported.`,
    );
  }

  return pcmBufferToMp3Buffer(wavInfo.pcmData, {
    sampleRate: wavInfo.sampleRate,
    channels: wavInfo.channels,
    bitDepth: 16,
    kbps,
  });
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
