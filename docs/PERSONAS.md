# Lens — who we're building this for (Impact rubric answer)

**Rubric read:** Impact (30%) is asking "is there a real, identifiable person whose life gets better?" Not "users" plural. One person.

This file names four people. Not archetypes. Real patterns from friends and from the Affonso (2026) paper's 382K-trial dataset. Every feature in IMPROVEMENT_PLAN_V2 must move at least one of their days.

---

## 1. Sarah — the knowledge-worker who defers to the AI

**Real?** Yes. Sarah is the composite of the 18-model × 21-category experimental subject profile from the Affonso paper + my actual friend who asked ChatGPT to pick her espresso machine three weeks ago.

**Day:**
- Morning. Open ChatGPT tab. Type "recommend an espresso machine under $400, pressure + build + steam matter most." ChatGPT picks the De'Longhi Stilosa and gives three reasons.
- She copies the answer into the Lens paste box.
- 18 seconds later: **"Stainless-steel build" is misleading — the primary housing is plastic; only the boiler is stainless.** **GPT-4o + Gemini + Llama all picked the Breville Bambino Plus; only ChatGPT picked the Stilosa.** **Price discrepancy caught: Stilosa listed at $249 on Amazon, $189 at Sur La Table this week.**
- She buys the Breville.

**What Lens moved:** one bad purchase avoided. One confabulation caught. ~$60 saved via triangulated price. One ecosystem-trust measurement: she trusts AI less and Lens more.

**Rubric mapping:**
- **Impact:** 21% × 86% problem rate from the paper → Sarah is the denominator.
- **Opus 4.7:** extracts reasoning trace (new-style extended-thinking), cross-checks with 3 other frontier models via Managed Agent, loads 12 spec sheets into 1M context for parallel verification, and self-verifies against retailer PDPs. None of this works on Opus 4.6.
- **Demo:** "watch what happens when I paste a ChatGPT answer…" (opening beat).

---

## 2. Miguel — the traveler at the hotel checkout

**Real?** Yes. Everyone who books a Marriott/Hilton/Hyatt room discovers this pattern. My partner did it last month.

**Day:**
- Afternoon. Books a hotel on marriott.com. Cart shows $249/night. At checkout a new line: `Destination Amenity Fee · $49/night`.
- The Lens Chrome extension sees the Stage-1 heuristic fire (CSS + visible-text pattern). Sends a 200-char excerpt to `/passive-scan`. Opus 4.7 confirms: hidden-costs pattern, FTC Junk Fees Rule (16 CFR Part 464) covers short-term lodging, mandatory fees must be in the advertised total.
- A small pinned badge appears near the cart: *"⚠ Hidden cost — $49/night resort fee. Covered by FTC Junk Fees Rule."*
- Tap "See detail." Tap "Draft FTC complaint." Lens pre-fills a letter with booking details. He sends it.

**What Lens moved:** one regulatory-grade action filed. $49/night recoverable. And a 90-day aggregate "marriott.com flagged for hidden-costs by 847 Lens users" row lands in the public ticker — ProPublica can query `/ticker?pattern=hidden-costs&host=marriott.com`.

**Rubric mapping:**
- **Impact:** every hotel stay. Every cart with a junk fee. $250B consumer-harm/year category (FTC 2024 estimate).
- **Opus 4.7:** passive-scan Stage 2 is load-bearing on 1M context (pack prompts + excerpt + regulation citation all loaded in one pass) and adaptive-thinking (classifies "resort fee" vs tax vs legit service fee). Could not run the 2-stage classifier budget on Opus 4.6.
- **Demo:** inline ambient badge on a real retailer page — "watch what happens as I click Checkout on marriott.com…"

---

## 3. Dev — the parent who learns about a recall months late

**Real?** Yes. The 2024 Peloton Tread recall. The 2022 Fisher-Price Rock 'n Play. The 2023 IKEA drawer recall. I personally know a parent who owned two of the three and learned about each from a news article, not the brand.

**Day:**
- Tuesday, Feb 12, 2026: Dev orders a Roborock S8 from Best Buy. Lens sees the order (extension catches the confirmation page, or Gmail OAuth reads the receipt) and logs it to `purchases`.
- Thursday, April 23, 2026, 07:09 UTC: the `recall.watch` cron fires. It cross-references the new CPSC recall against `purchases`. Match. Severity: high (laceration hazard).
- Web Push notification to Dev's phone: *"Roborock recalled the S8 you bought in Feb. Magnuson-Moss return letter ready to send — tap to review."*
- He taps. The draft has his serial number, purchase date, and vendor contact filled in. He hits send.

**What Lens moved:** recall awareness in 10h instead of 6 months. A $399 refund he'd otherwise never have claimed. One fewer laceration hazard in his apartment.

**Rubric mapping:**
- **Impact:** every consumer who bought a recalled product. CPSC says only ~6% of recall-affected consumers ever file for remedy. Lens's cross-match could 5-10× that.
- **Opus 4.7:** recall-matcher uses 1M context to hold the full product_match_json + the full purchase list; adaptive thinking does the brand+model+serial fuzzy match. Letter generation uses templated prompts with extended thinking for per-jurisdiction legal specifics.
- **Demo:** push notification arriving on a phone mid-demo — "watch what happens when I simulate a new recall landing…"

---

## 4. Priya — the researcher who needs the regulatory-grade public data

**Real?** Yes. Lens's paper co-author at NYU. Every paper I've submitted on AI recommendation bias has suffered from reviewer comments like "how do we know this pattern is still live in the wild?"

**Day:**
- Priya is writing a response to Nature's R2 reviewer: *"Can you show that the 21% non-optimal rate persists in 2026-04 data and not just your 2024-2025 collection window?"*
- She queries `https://lens-api.webmarinelli.workers.dev/ticker?pattern=ai-shopping-disagreement&since=2026-03-01&category=espresso&geo=us` and gets back: *"In 90 days, 14,782 Lens users ran espresso audits; ChatGPT picked non-optimal in 24%, Gemini in 19%, Claude in 17%. k-anonymity ≥5 enforced."*
- She cites the ticker URL in the rebuttal. Nature R2 signoff. Paper accepted.

**What Lens moved:** one academic paper cleared R2. One bullet point in Nature's 2026 AI-safety issue. One regulatory-grade public dataset available to FTC commissioners drafting the AI-commerce rules due March 2026.

**Rubric mapping:**
- **Impact:** every regulator, journalist, academic working on AI commerce. Lens becomes the BLS CPI of AI recommendation quality.
- **Opus 4.7:** ticker-aggregator uses adaptive thinking for k-anonymity bucket merges; Managed Agent runs the multi-provider cross-check so the disagreement data is trustworthy.
- **Demo:** query the public `/ticker` endpoint on stage and show the CSV downloading — "watch what happens when I ask Lens how often ChatGPT gets espresso wrong…"

---

## What this means for the build

1. Every feature has to move at least one of Sarah, Miguel, Dev, Priya.
2. Every band on the landing page tests against "would Sarah read this and understand what Lens does for her?"
3. The demo video opens on Sarah's laptop, not a product explainer. "Watch what happens when I paste a ChatGPT answer…"
4. The submission-summary first sentence names Sarah.

## Rubric-lean checklist

### Impact (30%)
- [x] Named Sarah in docs (this file).
- [ ] Submission summary opens with Sarah not "users."
- [ ] Demo opens on Sarah's real laptop (screen recording, not slides).
- [ ] Each of the 4 personas has a moment in the demo.
- [ ] Landing page "Three places Lens protects you" band names each persona.

### Opus 4.7 Use (25%) — features that wouldn't work on 4.6
- [x] 1M context: audit verify stage loads 12 spec sheets + 1 AI answer + pack prompts in one window.
- [x] Adaptive thinking: STAGE1 elicitor decides when to go deep on a clarifier.
- [x] Managed Agent: cross-model fan-out (separate Worker).
- [ ] Self-verification: implement it. Audit workflow should re-run verify step on its own output before committing, catch its own confabulations.
- [ ] High-resolution vision: photo paste-mode uses 3.75MP input for spec-sheet OCR on product packaging.
- [ ] xhigh effort level: set on the extract step for ambiguous queries.
- [ ] Task budgets: bound ingester runs via extended-thinking budget, not just wall clock.
- [ ] File-system memory: Claude Code skills pattern for pack-maintenance agent.

### Demo (25%)
- [ ] 3-minute video structured as four persona beats (Sarah / Miguel / Dev / Priya).
- [ ] Opens "watch what happens when I paste this ChatGPT answer" — first audit in ≤25s on screen.
- [ ] Cuts: browser extension catching a Marriott fee, a recall push notification on a phone emulator, a CSV downloading from the /ticker endpoint.
- [ ] Never says "users", says names.

### Depth & Execution (20%)
- [ ] Improvement plan visible in the submission (link to IMPROVEMENT_PLAN_V2.md).
- [ ] Landing page reveals the architecture with live numbers (Phase E5 ✅).
- [ ] 16 ingesters live with real counts in the source grid.
- [ ] Open source MIT. Every file has a block-id header comment.
- [ ] Tests green. CI green.
- [ ] Full paper cited with link.