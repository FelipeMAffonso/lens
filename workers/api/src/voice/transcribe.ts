// F11 — voice transcription endpoint. Proxies to Deepgram when the key is set;
// otherwise returns a stub transcript so the frontend loop still works during
// the hackathon demo without the Deepgram integration.

import { z } from "zod";

export const TranscribeRequestSchema = z.object({
  /** base64-encoded audio. Any Deepgram-accepted container (webm/opus, mp3, wav). */
  audioBase64: z.string().min(1).max(20_000_000),
  mimeType: z.string().default("audio/webm"),
  language: z.string().default("en"),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

export interface TranscribeResult {
  transcript: string;
  via: "deepgram" | "stub";
  durationMs: number;
  detectedLanguage?: string;
}

export interface TranscribeEnv {
  DEEPGRAM_API_KEY?: string | undefined;
}

export async function transcribe(
  req: TranscribeRequest,
  env: TranscribeEnv,
): Promise<TranscribeResult> {
  const t0 = Date.now();
  if (!env.DEEPGRAM_API_KEY) {
    return {
      transcript:
        "(voice input detected; Deepgram key not configured — transcript unavailable in demo mode)",
      via: "stub",
      durationMs: Date.now() - t0,
    };
  }

  const audioBuf = Uint8Array.from(atob(req.audioBase64), (c) => c.charCodeAt(0));
  const res = await fetch(
    `https://api.deepgram.com/v1/listen?model=nova-3&language=${encodeURIComponent(req.language)}&smart_format=true`,
    {
      method: "POST",
      headers: {
        authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "content-type": req.mimeType,
      },
      body: audioBuf.buffer as ArrayBuffer,
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      transcript: `(transcription failed: Deepgram HTTP ${res.status}: ${errBody.slice(0, 120)})`,
      via: "deepgram",
      durationMs: Date.now() - t0,
    };
  }
  const data = (await res.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string; confidence?: number }>;
        detected_language?: string;
      }>;
    };
  };
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const transcript = alt?.transcript ?? "";
  const detected = data.results?.channels?.[0]?.detected_language;
  const result: TranscribeResult = {
    transcript,
    via: "deepgram",
    durationMs: Date.now() - t0,
  };
  if (detected !== undefined) result.detectedLanguage = detected;
  return result;
}
