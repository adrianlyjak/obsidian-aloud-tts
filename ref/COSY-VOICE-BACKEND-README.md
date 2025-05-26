# CosyVoice OpenAI兼容API服务

本服务提供了与OpenAI TTS API兼容的接口，允许您使用CosyVoice模型进行文本到语音的转换。支持零样本声音克隆和流式处理。

## 功能

- OpenAI兼容的API接口
- 支持零样本声音克隆
- 支持流式音频生成
- 支持预定义声音列表
- 支持文本分块处理长文本
- 支持并发请求处理

## 安装依赖

```bash
pip install uvicorn starlette pyyaml torch torchaudio soundfile loguru pydantic
```

## 快速开始

使用预设参数启动服务：

```bash
./run_openai_compatible_api.sh
```

自定义参数启动：

```bash
./run_openai_compatible_api.sh \
  --host 192.168.2.36 \
  --port 8080 \
  --model-dir /path/to/model \
  --voice-config /path/to/voices.yaml \
  --api-key your_secret_key \
  --fp16 \
  --log-level info
```

## 配置声音

创建并编辑`voices.yaml`文件，参考`voices.yaml.example`的格式：

```yaml
alloy:
  name: "默认声音"
  description: "默认中性声音"
  reference_audio: "/path/to/samples/reference.wav"
  reference_text: "这是参考文本，应与音频内容匹配"

custom_voice:
  name: "自定义声音"
  description: "用户自定义声音"
  reference_audio: "/path/to/custom/voice.wav"
  reference_text: "这是自定义声音的参考文本"
```

## API使用

### 获取可用声音列表

```bash
curl -X GET "http://192.168.2.36:8080/v1/voices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_secret_key"
```

### 生成语音 (使用预设声音)

```bash
curl -X POST "http://192.168.2.36:8080/v1/audio/speech" \
  -H "Authorization: Bearer your_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cosy-tts",
    "input": "鱼声是一个高质量的中文语音合成模型，它支持零样本声音克隆。",
    "voice": "alloy",
    "response_format": "wav"
  }' \
  --output output.wav
```

### 生成语音 (零样本声音克隆)

```bash
curl -X POST "http://192.168.2.36:8080/v1/audio/speech" \
  -H "Authorization: Bearer your_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cosy-tts",
    "input": "鱼声是一个高质量的中文语音合成模型，它支持零样本声音克隆。",
    "voice": "alloy",
    "response_format": "wav",
    "reference_audio": [
      "/path/to/reference.wav"
    ],
    "reference_text": [
      "我觉得真的是他们的这个宣传鼓动策略挺挺牛逼的"
    ],
    "temperature": 0.5,
    "top_p": 0.7,
    "chunk_length": 200
  }' \
  --output clone.wav
```

### 使用流式处理 (实时生成)

```bash
curl -X POST "http://192.168.2.36:8080/v1/audio/speech" \
  -H "Authorization: Bearer your_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cosy-tts",
    "input": "鱼声是一个高质量的中文语音合成模型，它支持零样本声音克隆。",
    "voice": "alloy",
    "response_format": "wav",
    "reference_audio": [
      "/path/to/reference.wav"
    ],
    "reference_text": [
      "我觉得真的是他们的这个宣传鼓动策略挺挺牛逼的"
    ],
    "is_streaming": true
  }' \
  --output streaming.wav
```

## 命令行参数

| 参数 | 描述 | 默认值 |
|------|------|--------|
| --host | 监听地址 | 192.168.2.36 |
| --port | 监听端口 | 8080 |
| --api-key | API密钥 | your_secret_key |
| --model-dir | 模型目录 | checkpoints |
| --voice-config | 声音配置文件 | checkpoints/voices.yaml |
| --fp16 | 启用FP16推理 | 未启用 |
| --use-flow-cache | 启用flow缓存 | 未启用 |
| --log-level | 日志级别 | info |
| --max-text-length | 最大文本长度 | 1000 |

## 注意事项

1. 第一次请求会加载模型，可能需要较长时间，之后的请求会快很多
2. 零样本声音克隆的质量取决于参考音频和参考文本的匹配度
3. 对于长文本，建议启用分块处理，设置适当的chunk_length
4. 流式处理适合需要实时反馈的场景，但可能会牺牲一些质量
5. 保持参考音频和参考文本的一致性，以获得最佳克隆效果 