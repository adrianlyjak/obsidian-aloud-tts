// 在src/types/ttsService.d.ts新增文件
export interface TTSService {
  playText(text: string): Promise<void>;
  isAvailable(): boolean;
}