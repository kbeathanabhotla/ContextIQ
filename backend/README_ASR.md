# GLM-ASR Integration

This backend integrates the GLM-ASR-Nano-2512 model for live speech transcription via WebSockets.

## Model Information

- **Model**: GLM-ASR-Nano-2512
- **Source**: [zai-org/GLM-ASR](https://github.com/zai-org/GLM-ASR)
- **Parameters**: 1.5B
- **Supported Languages**: 17 languages including Mandarin, English, Cantonese

## WebSocket API

### Connection

Connect to the WebSocket endpoint:
```
ws://localhost:5000/transcription
```

### Events

#### Client → Server

1. **`audio_stream_start`**
   - Start a new audio stream
   - The model will be loaded if not already loaded

2. **`audio_chunk`**
   - Send audio data for transcription
   - Format:
     ```json
     {
       "audio": "base64_encoded_audio_data",
       "sample_rate": 16000,
       "format": "pcm",
       "timestamp": 1234567890
     }
     ```

3. **`audio_stream_end`**
   - End the audio stream

#### Server → Client

1. **`connected`**
   - Sent when client connects
   - Format: `{"status": "connected", "message": "Ready for audio transcription"}`

2. **`stream_started`**
   - Sent when stream starts
   - Format: `{"status": "ready"}`

3. **`transcription`**
   - Sent when transcription is available
   - Format: `{"text": "transcribed text", "timestamp": 1234567890}`

4. **`stream_ended`**
   - Sent when stream ends
   - Format: `{"status": "complete"}`

5. **`error`**
   - Sent on error
   - Format: `{"message": "error message"}`

## Audio Format

- **Sample Rate**: 16kHz (will be resampled if different)
- **Format**: PCM (16-bit signed integer) or WAV
- **Encoding**: Base64 encoded for transmission

## Health Check

Check transcription service health:
```
GET /api/transcription/health
```

Response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "device": "cuda",
  "model_name": "zai-org/GLM-ASR-Nano-2512"
}
```

## Usage Example (JavaScript)

```javascript
const socket = io('http://localhost:5000/transcription');

socket.on('connect', () => {
  console.log('Connected to transcription service');
});

socket.on('connected', (data) => {
  console.log(data.message);
  socket.emit('audio_stream_start');
});

socket.on('transcription', (data) => {
  console.log('Transcription:', data.text);
});

// Send audio chunk
function sendAudioChunk(audioData, sampleRate) {
  const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));
  socket.emit('audio_chunk', {
    audio: base64Audio,
    sample_rate: sampleRate,
    format: 'pcm',
    timestamp: Date.now()
  });
}

socket.on('error', (error) => {
  console.error('Transcription error:', error.message);
});
```

## Model Download

The model will be automatically downloaded from Hugging Face on first use:
- Model: `zai-org/GLM-ASR-Nano-2512`
- Cache location: `~/.cache/huggingface/`

## Requirements

- Python 3.11+
- PyTorch 2.0+
- Transformers 4.40+
- FFmpeg (installed in Docker container)
- CUDA (optional, for GPU acceleration)

## Notes

- First transcription may take longer as the model needs to be downloaded and loaded
- Model uses ~3GB of disk space
- GPU acceleration recommended for real-time performance
- CPU mode works but may be slower for real-time transcription

