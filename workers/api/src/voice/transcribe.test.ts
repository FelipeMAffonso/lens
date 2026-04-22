import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribe, TranscribeRequestSchema } from "./transcribe.js";

describe("TranscribeRequestSchema", () => {
  it("requires non-empty audioBase64", () => {
    expect(TranscribeRequestSchema.safeParse({ audioBase64: "" }).success).toBe(false);
  });
  it("applies defaults for mimeType + language", () => {
    const r = TranscribeRequestSchema.parse({ audioBase64: "aGVsbG8=" });
    expect(r.mimeType).toBe("audio/webm");
    expect(r.language).toBe("en");
  });
});

describe("transcribe — stub mode (no key)", () => {
  it("returns a stub transcript when DEEPGRAM_API_KEY absent", async () => {
    const r = await transcribe(
      { audioBase64: "aGVsbG8=", mimeType: "audio/webm", language: "en" },
      {},
    );
    expect(r.via).toBe("stub");
    expect(r.transcript).toContain("Deepgram key not configured");
    expect(typeof r.durationMs).toBe("number");
  });
});

describe("transcribe — Deepgram happy path", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("POSTs to Deepgram + returns the top alternative", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [{ transcript: "espresso machine under four hundred", confidence: 0.98 }],
                detected_language: "en",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await transcribe(
      { audioBase64: "aGVsbG8=", mimeType: "audio/webm", language: "en" },
      { DEEPGRAM_API_KEY: "dg_fake" },
    );
    expect(r.via).toBe("deepgram");
    expect(r.transcript).toBe("espresso machine under four hundred");
    expect(r.detectedLanguage).toBe("en");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("handles Deepgram HTTP error gracefully", async () => {
    globalThis.fetch = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;
    const r = await transcribe(
      { audioBase64: "aGVsbG8=", mimeType: "audio/webm", language: "en" },
      { DEEPGRAM_API_KEY: "dg_fake" },
    );
    expect(r.via).toBe("deepgram");
    expect(r.transcript).toContain("transcription failed");
  });
});
