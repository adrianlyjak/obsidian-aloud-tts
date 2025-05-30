# Aloud TTS 插件功能实现总结

## 🎯 已实现的主要功能

### 1. **自定义音色管理 (Custom Voice Management)**

#### 功能特性：
- ✅ **音色列表查询**：支持从后端API查询可用音色列表 (`/v1/models/info`)
- ✅ **后端音色添加**：用户可以手动添加后端已有的音色配置
- ✅ **音色参数支持**：支持音色ID、名称、描述（简化界面，专注核心功能）
- ✅ **音色管理界面**：简洁的添加、删除音色的UI界面
- ✅ **智能音色合并**：自动合并服务器音色和手动添加的音色

#### 技术实现：
- 扩展了 `TTSPluginSettings` 类型，添加 `customVoices` 字段
- 实现了 `addCustomVoice()` 和 `removeCustomVoice()` 方法
- 添加了 `getAvailableVoices()` 方法，支持从后端查询音色
- 在设置界面中实现了完整的音色管理UI组件

### 2. **中文文本智能分段 (Chinese Text Segmentation)**

#### 功能特性：
- ✅ **中文标点识别**：支持中文句号、问号、感叹号等标点符号分段
- ✅ **长度限制**：每个文本块最大300字符，避免API超时
- ✅ **混合语言支持**：同时处理中英文混合文本
- ✅ **智能分割**：优先在句子结束符分割，次要在逗号等标点分割

#### 技术实现：
- 改进了 `splitSentences()` 函数，添加中文标点符号支持
- 添加 `maxLength` 参数，限制文本块最大长度
- 更新了 `buildTrack()` 函数，设置300字符限制
- 支持的标点符号：`。！？；`（句子结束）、`，,；;、：:`（次要分割）

### 3. **OpenAI兼容API支持**

#### 功能特性：
- ✅ **自定义API端点**：支持配置自定义的OpenAI兼容API地址
- ✅ **音色查询API**：支持 `/v1/models/info` 端点查询可用音色

#### 技术实现：
- 扩展了 `openAITextToSpeech` 函数，支持自定义音色参数
- 实现了 `listVoices` 函数，查询后端可用音色
- 添加了默认音色列表作为fallback

### 4. **增强的用户界面**

#### 功能特性：
- ✅ **音色选择下拉框**：显示所有可用音色（服务器+手动添加）
- ✅ **音色刷新按钮**：手动刷新服务器音色列表
- ✅ **简化音色表单**：简洁的添加音色表单界面（ID、名称、描述）
- ✅ **音色列表展示**：显示已添加的后端音色列表
#### 技术实现：
- 重新实现了 `CustomVoices` 组件
- 扩展了CSS样式，支持新的UI元素

## 🔧 配置说明

### 音色配置格式
```typescript
interface CustomVoice {
  id: string;              // 音色ID（后端音色标识符）
  name: string;            // 显示名称
  description: string;     // 描述信息
}
```

### 文本分段配置
```typescript
const maxChunkLength = 300; // 最大块长度（字符）
const minLength = 20;       // 最小块长度（字符）
```



## 🌐 API兼容性

### 支持的API端点：
1. **`/v1/audio/speech`** - TTS语音合成
   - 支持标准OpenAI参数

2. **`/v1/models/info`** - 音色列表查询
   - 返回格式：`{ voices: [{ id, name, description }] }`
   - 如果端点不存在，自动使用默认音色列表

### 请求示例：
```json
{
  "model": "Kokoro",
  "voice": "custom_voice_1",
  "input": "Hello world",
  "speed": 1,
  "reference_audio": ["/path/to/reference.wav"],
  "reference_text": ["参考文本"]
}
```

## 📁 文件结构

### 主要修改的文件：
- `src/player/TTSPluginSettings.ts` - 扩展设置类型和管理方法
- `src/player/TTSModel.ts` - 添加音色查询和TTS参数扩展
- `src/components/TTSPluginSettingsTab.tsx` - 重新实现音色管理UI
- `src/components/PlayerView.tsx` - 播放器界面组件
- `src/util/misc.ts` - 改进文本分段算法，支持中文
- `src/player/ActiveAudioText.ts` - 更新文本分段配置
- `styles.css` - 添加新UI元素的样式

### 新增功能模块：
- 自定义音色管理系统
- 中文文本智能分段系统
- OpenAI兼容API扩展
- 增强的用户界面组件

## 🚀 使用方法

1. **配置API**：在设置中选择"OpenAI Compatible (Advanced)"
2. **设置API地址**：填入您的TTS服务API地址（如 `http://localhost:8000`）
3. **配置API密钥**：填入相应的API密钥
4. **选择模型**：填入您的TTS模型名称（如 `Kokoro`）
5. **管理音色**：
   - 点击刷新按钮获取服务器音色
   - 或手动添加后端已有的音色（如果自动获取失败）
6. **使用中文文本**：直接粘贴中文文本，自动按句子分段（≤300字符）

## ✨ 特色功能

- **智能音色管理**：自动合并服务器和手动添加的音色
- **中文文本支持**：完美支持中文分段，每段≤300字符
- **混合语言处理**：中英文混合文本智能识别和分段
- **简洁界面设计**：专注核心功能，避免复杂配置
- **完全兼容**：支持标准OpenAI API和扩展功能
- **用户友好**：直观的界面和简化的配置流程

这个实现提供了一个功能完整、易于使用的TTS插件，支持自定义音色管理和中文文本智能分段。 