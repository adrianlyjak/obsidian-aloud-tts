// Type declarations for kokoro-js
declare module "kokoro-js" {
  export interface KokoroTTSOptions {
    dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
    device?: "wasm" | "webgpu" | "cpu" | null;
    progress_callback?: (progress: ProgressInfo) => void;
  }

  export interface ProgressInfo {
    status: string;
    name?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }

  export interface GenerateOptions {
    voice?: string;
    speed?: number;
  }

  export interface AudioOutput {
    toBlob(): Blob;
    save(path: string): void;
  }

  export class KokoroTTS {
    static from_pretrained(
      model_id: string,
      options?: KokoroTTSOptions,
    ): Promise<KokoroTTS>;

    generate(text: string, options?: GenerateOptions): Promise<AudioOutput>;
    list_voices(): string[];
  }

  export class TextSplitterStream {
    push(text: string): void;
    close(): void;
    flush(): void;
  }
}
