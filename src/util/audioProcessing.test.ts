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
});
