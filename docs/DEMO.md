# Demo script — Lens

Three canonical scenarios. For the submission video, Scenario 1 is the headline. 2 and 3 appear in the Act 3 montage and in the README walk-through.

## Scenario 1 — Espresso machine, ChatGPT

- **Host AI:** ChatGPT
- **User prompt:** "espresso machine under $400, pressure + build quality + steam power matter most"
- **ChatGPT picked:** De'Longhi Stilosa (~$249)
- **Claims cited:** 15-bar pressure, stainless-steel build, manual steam wand
- **Expected Lens verdict:** spec-optimal is a higher-tier machine (Breville or similar); "stainless-steel build" is flagged as misleading (plastic housing + stainless boiler only); 2 of 3 other frontier models disagree with ChatGPT.

Fixture at `fixtures/scenarios/01_espresso_chatgpt.json`.

## Scenario 2 — Laptop under $1000, Claude

- **Host AI:** Claude.ai
- **User prompt:** "best laptop under $1000 for coding"
- **Claude picked:** (TBD — record a real Claude session during build)
- **Expected Lens verdict:** flags a spec-count confabulation (RAM or SSD mismatch); spec-optimal ranked first; ≥2 of 3 other models disagree with Claude.

## Scenario 3 — Over-ear ANC headphones under $300, Gemini

- **Host AI:** Gemini
- **User prompt:** "ANC over-ear headphones under $300 for music and calls"
- **Gemini picked:** (TBD — expected to be Sony WH-1000XM5)
- **Expected Lens verdict:** flags battery-hour or codec claim; spec-optimal likely the Sennheiser Momentum 4; 2-3 of 3 other models agree with Lens.

## Recording checklist

1. Dropbox sync PAUSED (to avoid file-write noise mid-record).
2. Worker deployed, extension loaded-unpacked, web dashboard running locally or at its Pages URL.
3. API keys set: `wrangler secret put ANTHROPIC_API_KEY`, OPENAI_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY.
4. Latency audit run — spec-optimal + cross-model verdict under 20 seconds end to end.
5. Run each scenario once live against real web data; cache the responses in `fixtures/` for deterministic playback.
6. Screen recording at 1080p, 30fps. No desktop clutter. Browser at 100% zoom.
7. Voice-over recorded separately; synced in post to the 3:00 cap.
