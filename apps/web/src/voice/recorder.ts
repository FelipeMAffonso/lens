// F11 — browser voice recorder. Wraps MediaRecorder so the dashboard can
// capture short voice notes and POST them to /voice/transcribe.

const API_BASE = (import.meta as { env?: { VITE_LENS_API_URL?: string } }).env?.VITE_LENS_API_URL
  ?? "https://lens-api.webmarinelli.workers.dev";

export interface RecorderState {
  status: "idle" | "recording" | "stopped" | "error";
  error?: string;
  blob?: Blob;
  durationMs?: number;
}

export interface RecorderHandle {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  state: () => RecorderState;
  subscribe: (fn: (s: RecorderState) => void) => () => void;
}

export function createRecorder(mimeType = "audio/webm"): RecorderHandle {
  let state: RecorderState = { status: "idle" };
  const subs = new Set<(s: RecorderState) => void>();
  const emit = (): void => {
    for (const s of subs) s(state);
  };
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let startTs = 0;

  return {
    state: () => state,
    subscribe: (fn) => {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },
    async start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        state = { status: "error", error: (e as Error).message };
        emit();
        throw e;
      }
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      });
      mediaRecorder.start();
      startTs = Date.now();
      state = { status: "recording" };
      emit();
    },
    async stop() {
      if (!mediaRecorder) throw new Error("not_recording");
      return await new Promise<Blob>((resolve) => {
        mediaRecorder!.addEventListener(
          "stop",
          () => {
            const blob = new Blob(chunks, { type: mimeType });
            state = { status: "stopped", blob, durationMs: Date.now() - startTs };
            emit();
            stream?.getTracks().forEach((t) => t.stop());
            resolve(blob);
          },
          { once: true },
        );
        mediaRecorder!.stop();
      });
    },
  };
}

export async function transcribeBlob(blob: Blob, language = "en"): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  const base64 = btoa(bin);
  const res = await fetch(`${API_BASE}/voice/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioBase64: base64, mimeType: blob.type, language }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { transcript: string };
  return data.transcript;
}
