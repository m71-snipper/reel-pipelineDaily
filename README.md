# Reel Pipeline

Automated short-form video generation pipeline.

## Dependencies

- Node.js >= 18
- FFmpeg (must be available in PATH)
- Python (for TTS)

## Whisper.cpp Setup

This pipeline uses local, offline transcription for word-level caption alignment using `whisper.cpp` to avoid API costs.

### Windows Installation

1. Download the latest `whisper-bin-x64.zip` from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases).
2. Extract the contents into `bin/whisper/` (so that `bin/whisper/main.exe` exists).
3. Download a GGML model, such as `ggml-base.en.bin` or `ggml-tiny.en.bin` from [HuggingFace](https://huggingface.co/ggerganov/whisper.cpp) (make sure the model format is compatible with the `whisper.cpp` version you downloaded).
4. Place the model in `models/` (e.g., `models/ggml-base.en.bin`).

### Linux/macOS Installation

1. Clone `whisper.cpp` and build it using `make` or CMake.
2. Copy the resulting `main` binary to `bin/whisper/main`.
3. Download the model as described above.

### Configuration

Ensure your `.env` contains:

```env
WHISPER_ENABLED=true
WHISPER_MODEL=base.en
WHISPER_MODEL_PATH=./models/ggml-base.en.bin
WHISPER_BIN_PATH=./bin/whisper/main.exe
WHISPER_THREADS=4
```

## Running

`npm start` (or whatever your main entry point is).
To run tests, use `npm run test:reel`.
