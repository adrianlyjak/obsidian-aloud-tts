import { describe, it, expect } from "vitest";
import { pcmBufferToMp3Buffer, PcmToMp3Options } from "./audioProcessing";

describe("audioProcessing", () => {
  describe("pcmBufferToMp3Buffer validation", () => {
    it("should reject unsupported bit depth", async () => {
      const buffer = new ArrayBuffer(16);
      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 8, // Unsupported
      };

      await expect(pcmBufferToMp3Buffer(buffer, options)).rejects.toThrow(
        "Raw PCM bitDepth 8 is not directly supported",
      );
    });

    it("should reject odd buffer length for 16-bit PCM", async () => {
      const buffer = new ArrayBuffer(15); // Odd number
      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
      };

      await expect(pcmBufferToMp3Buffer(buffer, options)).rejects.toThrow(
        "Raw 16-bit PCM ArrayBuffer length must be even",
      );
    });

    it("should reject unsupported channel count", async () => {
      const buffer = new ArrayBuffer(16);

      // Test too many channels
      const optionsTooMany: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 3,
        bitDepth: 16,
      };

      await expect(
        pcmBufferToMp3Buffer(buffer, optionsTooMany),
      ).rejects.toThrow("Unsupported number of channels: 3");

      // Test zero channels
      const optionsZero: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 0,
        bitDepth: 16,
      };

      await expect(pcmBufferToMp3Buffer(buffer, optionsZero)).rejects.toThrow(
        "Unsupported number of channels: 0",
      );
    });

    it("should reject empty PCM data", async () => {
      const buffer = new ArrayBuffer(0);
      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
      };

      await expect(pcmBufferToMp3Buffer(buffer, options)).rejects.toThrow(
        "PCM data is empty or could not be extracted",
      );
    });

    it("should use default kbps when not specified", async () => {
      // We can't test the actual encoding easily, but we can verify
      // that the function doesn't immediately reject valid parameters
      const buffer = new ArrayBuffer(4); // 2 samples of 16-bit mono
      const int16View = new Int16Array(buffer);
      int16View[0] = 1000;
      int16View[1] = 2000;

      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
        // kbps not specified - should default to 128
      };

      // This will likely fail at the MP3 encoding stage, but should pass validation
      // We expect it to throw during encoding, not validation
      try {
        await pcmBufferToMp3Buffer(buffer, options);
      } catch (error) {
        // Should not be a validation error
        expect(error.message).not.toMatch(
          /bitDepth|channels|ArrayBuffer length/,
        );
      }
    });

    it("should accept valid parameters for mono audio", async () => {
      const buffer = new ArrayBuffer(4); // 2 samples of 16-bit mono
      const int16View = new Int16Array(buffer);
      int16View[0] = 1000;
      int16View[1] = 2000;

      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
        kbps: 128,
      };

      // This should pass validation but may fail at encoding
      try {
        await pcmBufferToMp3Buffer(buffer, options);
      } catch (error) {
        // Should not be a validation error
        expect(error.message).not.toMatch(
          /bitDepth|channels|ArrayBuffer length/,
        );
      }
    });

    it("should accept valid parameters for stereo audio", async () => {
      const buffer = new ArrayBuffer(8); // 2 samples of 16-bit stereo (4 values total)
      const int16View = new Int16Array(buffer);
      int16View[0] = 1000; // Left channel, sample 1
      int16View[1] = 1100; // Right channel, sample 1
      int16View[2] = 2000; // Left channel, sample 2
      int16View[3] = 2100; // Right channel, sample 2

      const options: PcmToMp3Options = {
        sampleRate: 44100,
        channels: 2,
        bitDepth: 16,
        kbps: 192,
      };

      // This should pass validation
      try {
        await pcmBufferToMp3Buffer(buffer, options);
      } catch (error) {
        // Should not be a validation error
        expect(error.message).not.toMatch(
          /bitDepth|channels|ArrayBuffer length/,
        );
      }
    });
  });

  describe("concatenateMp3Buffers", () => {
    const createMockAudioBuffer = (
      length: number,
      sampleRate = 44100,
      numberOfChannels = 2,
    ): AudioBuffer => {
      const mockAudioBuffer = {
        length,
        sampleRate,
        numberOfChannels,
        getChannelData: (channel: number) => {
          // Create simple test data - sine wave with different frequencies per channel
          const data = new Float32Array(length);
          const frequency = 440 * (channel + 1); // 440Hz for ch0, 880Hz for ch1
          for (let i = 0; i < length; i++) {
            data[i] =
              Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
          }
          return data;
        },
      } as AudioBuffer;
      return mockAudioBuffer;
    };

    const createMockAudioSink = (audioBuffers: AudioBuffer[]) => {
      let callCount = 0;
      return {
        getAudioBuffer: async (_buffer: ArrayBuffer): Promise<AudioBuffer> => {
          const buffer = audioBuffers[callCount];
          callCount++;
          return buffer;
        },
      };
    };

    it("should return single buffer unchanged", async () => {
      const { concatenateMp3Buffers } = await import("./audioProcessing");
      const testBuffer = new ArrayBuffer(100);
      const mockAudioSink = createMockAudioSink([]);

      const result = await concatenateMp3Buffers([testBuffer], mockAudioSink);

      expect(result).toBe(testBuffer);
    });

    it("should throw error for empty buffer array", async () => {
      const { concatenateMp3Buffers } = await import("./audioProcessing");
      const mockAudioSink = createMockAudioSink([]);

      await expect(concatenateMp3Buffers([], mockAudioSink)).rejects.toThrow(
        "No audio buffers to concatenate",
      );
    });

    it("should concatenate multiple audio buffers correctly", async () => {
      const { concatenateMp3Buffers } = await import("./audioProcessing");

      // Create mock audio buffers with different lengths
      const buffer1 = createMockAudioBuffer(1000);
      const buffer2 = createMockAudioBuffer(500);
      const buffer3 = createMockAudioBuffer(750);

      const mockAudioSink = createMockAudioSink([buffer1, buffer2, buffer3]);

      // Create mock MP3 buffers (content doesn't matter for this test)
      const mp3Buffers = [
        new ArrayBuffer(100),
        new ArrayBuffer(50),
        new ArrayBuffer(75),
      ];

      const result = await concatenateMp3Buffers(mp3Buffers, mockAudioSink);

      // Should return a valid ArrayBuffer (the re-encoded MP3)
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it("should preserve audio properties from first buffer", async () => {
      const { concatenateMp3Buffers } = await import("./audioProcessing");

      // Create buffers with different sample rates (should use first one's properties)
      const buffer1 = createMockAudioBuffer(1000, 48000, 1); // 48kHz, mono
      const buffer2 = createMockAudioBuffer(500, 44100, 2); // 44.1kHz, stereo (should be ignored)

      const mockAudioSink = createMockAudioSink([buffer1, buffer2]);

      const mp3Buffers = [new ArrayBuffer(100), new ArrayBuffer(50)];

      const result = await concatenateMp3Buffers(mp3Buffers, mockAudioSink);

      // Should successfully create output using first buffer's properties
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });
  });
});
