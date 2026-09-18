# Reel Pipeline Implementation Plan

## Current Environment

- **Node.js**: v20.20.2
- **npm**: v10.8.2
- **FFmpeg**: v8.1-full_build (Available)
- **ImageMagick**: Not installed (Video rendering will rely entirely on FFmpeg and Node.js-based composition).

## Planned Dependencies

- `firebase-admin`: Firebase database and storage integration.
- `fluent-ffmpeg`: Abstraction for FFmpeg commands to render and composite video/audio/captions.
- `axios`: For making HTTP requests to external APIs (Pexels, Jamendo).
- `dotenv`: Managing environment variables.
- `pino`: For structured logging.

## Architecture

The system will be a sequential Node.js pipeline with isolated responsibilities:

1. **Firebase / Config**: Reads the content source (`instagram_quotes`) and validates eligible jobs.
2. **Category Engine**: Maps quotes to appropriate visual and audio parameters.
3. **Providers (Pexels, Jamendo, Edge TTS)**: Fetch necessary assets based on the category.
4. **Alignment Engine**: Extracts real audio-derived word timestamps from TTS.
5. **Captions & Composer**: Renders a 1080x1920 30FPS MP4 combining background, dark overlay, captions, and audio tracks.

## Major Phases

Follows the requested Phase A to P structure strictly. Currently working on **Phase B and C**: Node project setup and Firebase quote selection.

## Known Risks

- **Audio/Caption Synchronization**: Edge TTS might not provide reliable word-level timestamps in the current environment. We will need to investigate its metadata output or use an alternative forced alignment method if it fails.
- **FFmpeg Caption Rendering**: Complex cinematic caption animations might be difficult with basic `drawtext`. We may need to dynamically generate `.ass` files (Advanced SubStation Alpha) and burn them into the video.
- **Provider Reliability**: Rate limits from Pexels or Jamendo could fail the pipeline.

## Test Strategy

- Individual unit tests for category resolution and quote selection.
- Development command `npm run test:firebase` to validate Firebase read logic safely without triggering full reel generation.
- Full end-to-end local generation without publishing.
