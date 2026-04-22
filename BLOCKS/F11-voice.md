# F11 — Voice input (stub + infrastructure)

**Status:** in progress (stub).

## Scope (minimum viable)
- `apps/web/src/voice/recorder.ts`: MediaRecorder wrapper → audio blob → POST /voice/transcribe.
- `workers/api/src/voice/transcribe.ts`: `POST /voice/transcribe` endpoint; proxies to Deepgram streaming API when DEEPGRAM_API_KEY set; otherwise returns stub transcript.
- Wire to index.ts.
- Unit tests for transcribe handler + recorder lifecycle.

## Acceptance
- [ ] POST /voice/transcribe with {audio: base64} returns {transcript: string}.
- [ ] Recorder exposes start/stop/getBlob lifecycle.
- [ ] Tests: 4+ (recorder states, endpoint OK, endpoint no-key fallback).
