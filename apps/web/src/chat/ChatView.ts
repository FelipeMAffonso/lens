// CJ-W53 — the chat surface. Ties together bubbles + composer + rotator,
// drives the Stage 1 clarify loop / Stage 2 audit / Stage 3 recommend +
// card / Stage 4 follow-up answer loop.

import type { AuditResult } from "@lens/shared";
import { renderResult } from "../main.js";
import { botBubble, typingBubble, userBubble } from "./bubbleRenderer.js";
import { mountComposer, type ComposerHandles } from "./composer.js";
import { ConversationStore } from "./ConversationStore.js";
import { mountRotatingStatus, type RotatingStatusHandle } from "./rotatingStatus.js";
import { inferHostAI, looksLikeAIRecommendation, looksLikeAnyProductUrl, shouldTriggerAudit } from "./stages.js";

const API_BASE = import.meta.env.VITE_LENS_API_URL ?? "https://lens-api.webmarinelli.workers.dev";

type Phase = "elicit" | "generating" | "answered" | "followup";

interface ChatViewOptions {
  mount: HTMLElement;
  resultMount: HTMLElement;
  sessionId?: string;
  initialSeedChips?: Array<{ label: string; value: string }>;
}

export function mountChatView(opts: ChatViewOptions): void {
  const { mount, resultMount } = opts;

  const root = document.createElement("section");
  root.className = "lc-root";
  root.setAttribute("aria-label", "Lens chat");

  const transcript = document.createElement("div");
  transcript.className = "lc-transcript";
  root.append(transcript);

  const chipsHost = document.createElement("div");
  chipsHost.className = "lc-seed-chips";
  root.append(chipsHost);

  const composerHost = document.createElement("div");
  root.append(composerHost);
  mount.innerHTML = "";
  mount.append(root);

  const store = new ConversationStore(opts.sessionId);
  const composer = mountComposer(composerHost);
  let phase: Phase = "elicit";
  let rotator: RotatingStatusHandle | null = null;
  let lastAudit: AuditResult | null = null;

  // First bot greeting. Voice aligned with LENS_VOICE_COVENANT in
  // prompts.ts. Em-dash-free. No affiliates. Product speaks as Lens.
  const preExisting = store.all();
  if (preExisting.length === 0) {
    const greeting =
      "Hi, I'm Lens — your AI shopping companion. I work for you, not the retailers. Tell me what you're after, paste what another AI told you, or drop a product URL — I'll consult every frontier model plus real product data and give you the answer that actually fits.";
    const t = store.append("assistant", greeting);
    transcript.append(botBubble(t.text));
    renderSeedChips();
  } else {
    for (const turn of preExisting) {
      transcript.append(turn.role === "user" ? userBubble(turn.text) : botBubble(turn.text));
    }
    chipsHost.remove();
    // Judge P0-3: if we're restoring a prior session that already ended in
    // an audit card, surface a "Start a new audit" affordance so the user
    // isn't stuck in followup phase forever.
    if (preExisting.some((t) => t.role === "assistant" && /full ranking is below/i.test(t.text))) {
      phase = "followup";
      renderNewAuditChip();
    }
  }
  composer.focus();

  // Photo upload path. The composer's 📎 button fires this with a data-URL.
  // We strip the prefix, route to /audit kind="photo" (Opus 4.7 3.75MP
  // vision), and render a preview bubble so the user sees what they uploaded.
  composer.onImageSubmit(async (dataUrl, mime, filename) => {
    if (phase === "generating") return;
    chipsHost.remove();
    const ack = `Got it, looking at your photo (${filename || "uploaded image"}). Lens's vision pipeline will parse the product and run the audit.`;
    // Render a user "bubble" with the preview.
    const previewBubble = document.createElement("div");
    previewBubble.className = "lc-user lc-user-image";
    previewBubble.innerHTML = `<img src="${dataUrl}" alt="Uploaded product photo" style="max-width:240px;max-height:180px;border-radius:6px;display:block;" />`;
    transcript.append(previewBubble);
    store.append("user", "[photo uploaded]");
    const t = store.append("assistant", ack);
    transcript.append(botBubble(t.text));
    scrollBottom();
    // Strip the "data:image/png;base64," prefix so the backend receives
    // the bare base64 body per AuditInputSchema.kind="photo".
    const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
    await runAudit({ photoBase64: base64, photoMime: mime });
  });

  composer.onSubmit(async (text) => {
    if (phase === "generating") return;
    chipsHost.remove();
    // Append user bubble immediately (optimistic).
    const userTurn = store.append("user", text);
    transcript.append(userBubble(userTurn.text));
    composer.clear();
    scrollBottom();

    if (phase === "followup") {
      // Judge P1-9: detect a new-topic signal and re-enter Stage-1 rather
      // than routing to followup with the old audit as context.
      if (looksLikeNewTopic(text)) {
        resetForNewAudit();
        await runClarifyTurn();
        return;
      }
      await runFollowup(text);
      return;
    }

    // Any http(s) URL short-circuit. Routes to /audit kind="url". Backend
    // runs S3-W15 per-host parsers for known retailers and falls through to
    // Jina-markdown + Opus structured extraction for any other site. The
    // client just needs to recognize "this is a URL paste" and the server
    // degrades gracefully if the page blocks bots or has no structured data.
    //
    // Judge P1-2 (2026-04-24): drop the first-turn guard. If a user says "I
    // need a laptop" → clarifier asks about budget → user replies with a
    // Lenovo URL, that's still a URL paste. Route it.
    {
      const urlMatch = looksLikeAnyProductUrl(text);
      if (urlMatch.ok) {
        const hostLabel = (() => {
          try {
            return new URL(urlMatch.url).host.replace(/^www\./, "");
          } catch {
            return "the product page";
          }
        })();
        const ack = urlMatch.knownRetailer
          ? `Got it, pulling the product page from ${hostLabel} and auditing it.`
          : `Got it, I'll try to parse the product page from ${hostLabel}. If the site blocks scrapers I'll fall back to describing the link and asking a clarifying question.`;
        const t = store.append("assistant", ack);
        transcript.append(botBubble(t.text));
        scrollBottom();
        await runAudit({ pasteRaw: undefined, urlMode: urlMatch.url });
        return;
      }
    }
    const userOnly = store.all().filter((t) => t.role === "user");

    // improve-01 Job 2 short-circuit: if this is the first user turn AND it
    // looks like a pasted AI-generated product recommendation (cited reasons,
    // explicit model code, explicit price), skip the clarifier and go
    // straight to audit with kind="text". This is the marquee hackathon
    // pitch: paste an AI answer, see the audit. Don't ask another question.
    if (userOnly.length === 1 && looksLikeAIRecommendation(text)) {
      // Acknowledge before the audit wall, so the user doesn't feel ignored.
      const ack = "Got it, that reads like an AI recommendation. Let me audit the claims against real product data.";
      const t = store.append("assistant", ack);
      transcript.append(botBubble(t.text));
      scrollBottom();
      await runAudit({ pasteRaw: text, hostAi: inferHostAI(text) });
      return;
    }

    // Stage-1 loop: call /chat/clarify until ready or local gate says so.
    if (shouldTriggerAudit(store.all())) {
      await runAudit();
      return;
    }

    await runClarifyTurn();
  });

  async function runClarifyTurn(): Promise<void> {
    composer.setDisabled(true);
    const typing = typingBubble();
    transcript.append(typing);
    scrollBottom();

    try {
      const res = await fetch(`${API_BASE}/chat/clarify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turns: store.all().map((t) => ({ role: t.role, text: t.text, at: t.at })),
          userPrompt: inferInitialUserPrompt(),
        }),
      });
      typing.remove();
      if (!res.ok) throw new Error(`clarify ${res.status}`);
      const body = (await res.json()) as {
        kind: "clarify" | "ready" | "audit-now" | "error";
        question?: string;
        message?: string;
        raw?: string;
        hostAi?: "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";
      };
      if (body.kind === "ready") {
        await runAudit();
        return;
      }
      // improve-01: server also runs the Job 2 detector; if the local mirror
      // ever misses (version skew) the server can still push us onto the
      // paste route with the original raw text.
      if (body.kind === "audit-now" && body.raw) {
        const ack = "Got it, that reads like an AI recommendation. Let me audit the claims against real product data.";
        const t = store.append("assistant", ack);
        transcript.append(botBubble(t.text));
        scrollBottom();
        await runAudit({ pasteRaw: body.raw, hostAi: body.hostAi ?? "unknown" });
        return;
      }
      if (body.kind === "clarify" && body.question) {
        const t = store.append("assistant", body.question);
        transcript.append(botBubble(t.text));
        scrollBottom();
      } else {
        throw new Error(body.message ?? "clarify returned no question");
      }
    } catch (err) {
      typing.remove();
      console.warn("[chat] clarify failed, falling through to audit:", (err as Error).message);
      // If we can't clarify, the best move is to run the audit with what we have.
      await runAudit();
      return;
    } finally {
      composer.setDisabled(false);
      composer.focus();
    }
  }

  async function runAudit(
    opts: {
      pasteRaw?: string;
      hostAi?: "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";
      urlMode?: string;
      photoBase64?: string;
      photoMime?: string;
    } = {},
  ): Promise<void> {
    phase = "generating";
    composer.setDisabled(true);
    composer.setPlaceholder("Hold on, Lens is consulting every frontier model and real products…");
    rotator = mountRotatingStatus(transcript, undefined, {
      // Judge P1-5: pause announcements while the user focuses the composer.
      pauseWhenFocused: composer.textarea,
    });
    scrollBottom();

    // Lens runs 4 audit kinds depending on input:
    //   photo  — user-uploaded product photo. Opus 4.7 3.75MP vision parses.
    //   url    — any http(s) URL. Per-host parsers + Jina/Opus fallback.
    //   text   — verbatim AI recommendation to audit.
    //   query  — free-text description, folded from chat history.
    let body: string;
    if (opts.photoBase64) {
      // Judge P0-1 (2026-04-24): always send imageMime so the backend
      // sets the correct Claude vision media_type (default jpeg is the
      // most common phone-camera default but png/webp happen too).
      body = JSON.stringify({
        kind: "photo",
        imageBase64: opts.photoBase64,
        imageMime: opts.photoMime ?? "image/jpeg",
        userPrompt: inferInitialUserPrompt(),
      });
    } else if (opts.urlMode) {
      body = JSON.stringify({
        kind: "url",
        url: opts.urlMode,
        userPrompt: inferInitialUserPrompt(),
      });
    } else if (opts.pasteRaw && opts.pasteRaw.trim().length > 0) {
      body = JSON.stringify({
        kind: "text",
        source: opts.hostAi ?? "unknown",
        raw: opts.pasteRaw,
      });
    } else {
      const userPrompt = buildAuditPrompt();
      body = JSON.stringify({ kind: "query", userPrompt });
    }

    try {
      const res = await fetch(`${API_BASE}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`audit ${res.status} ${errText.slice(0, 200)}`);
      }
      const audit = (await res.json()) as AuditResult;
      lastAudit = audit;

      // Bot's one-paragraph recap — use specOptimal + top criterion from the audit.
      const topCriterion = audit.intent.criteria
        .slice()
        .sort((a, b) => b.weight - a.weight)[0]?.name;
      const recap = buildRecap(audit, topCriterion);
      rotator?.finalize("Done. Here's what Lens found.");
      rotator = null;
      const t = store.append("assistant", recap);
      transcript.append(botBubble(t.text));
      scrollBottom();

      // Render the full audit card below.
      renderResult(audit);
      resultMount.scrollIntoView({ behavior: "smooth", block: "start" });

      phase = "followup";
      composer.setDisabled(false);
      composer.setPlaceholder('Ask a follow-up, e.g. "what about the runner-up?"');
      composer.focus();
      // Judge P0-3: show "Start a new audit" chip after the card drops.
      renderNewAuditChip();
    } catch (err) {
      rotator?.stop();
      rotator = null;
      const msg = (err as Error).message;
      const t = store.append(
        "assistant",
        "I ran into a problem running the search. Check the console for details, or try again in a moment.",
      );
      transcript.append(botBubble(t.text));
      console.warn("[chat] audit failed:", msg);
      phase = "elicit";
      composer.setDisabled(false);
      composer.setPlaceholder("Try rephrasing your question…");
      composer.focus();
    }
  }

  async function runFollowup(question: string): Promise<void> {
    if (!lastAudit) {
      const t = store.append(
        "assistant",
        "Start a new shopping question first. I don't have an audit to talk about yet.",
      );
      transcript.append(botBubble(t.text));
      return;
    }
    composer.setDisabled(true);
    const typing = typingBubble();
    transcript.append(typing);
    scrollBottom();

    try {
      const res = await fetch(`${API_BASE}/chat/followup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auditResult: lastAudit,
          conversation: store.all().map((t) => ({ role: t.role, text: t.text, at: t.at })),
          question,
        }),
      });
      typing.remove();
      const body = (await res.json()) as { kind: string; text: string };
      if (body.kind === "answer" && body.text) {
        const t = store.append("assistant", body.text);
        transcript.append(botBubble(t.text));
      } else {
        throw new Error("followup returned no text");
      }
    } catch (err) {
      typing.remove();
      const t = store.append(
        "assistant",
        "I couldn't run that follow-up right now. The full ranking is still below. Tell me what you'd change and I'll re-rank.",
      );
      transcript.append(botBubble(t.text));
      console.warn("[chat] followup failed:", (err as Error).message);
    } finally {
      composer.setDisabled(false);
      composer.focus();
      scrollBottom();
    }
  }

  function renderSeedChips(): void {
    const seeds = opts.initialSeedChips ?? [
      { label: "☕ Espresso machine under $400", value: "I'm looking for an espresso machine under $400, and build quality + pressure matter most" },
      { label: "💻 Laptop for coding under $1000", value: "I need a laptop under $1000 for coding, and battery life, keyboard, and reliability matter most" },
      { label: "🎧 ANC headphones under $300", value: "Over-ear ANC headphones under $300, comfort + battery + mic quality matter most" },
      { label: "🪑 Office chair under $500", value: "An office chair under $500 with lumbar support, 3D armrests, and a 10-year warranty" },
    ];
    chipsHost.innerHTML = "";
    for (const s of seeds) {
      const b = document.createElement("button");
      b.className = "lc-chip";
      b.type = "button";
      b.textContent = s.label;
      b.addEventListener("click", () => {
        composer.textarea.value = s.value;
        composer.textarea.focus();
      });
      chipsHost.append(b);
    }
  }

  function scrollBottom(): void {
    requestAnimationFrame(() => {
      transcript.scrollTop = transcript.scrollHeight;
    });
  }

  function inferInitialUserPrompt(): string | undefined {
    const first = store.all().find((t) => t.role === "user");
    return first?.text;
  }

  function buildAuditPrompt(): string {
    // Judge P0-4 + 2026-04-22 calibration fix: fold assistant clarifier Qs as
    // Q/A pairs, but SKIP the opening greeting so it doesn't get paired with
    // the user's first real turn as if the user were "answering" the greeting.
    // A clarifier only counts as Q if (a) it ends in "?" AND (b) a user turn
    // preceded it (greeting is always the first assistant turn).
    const turns = store.all();
    const lines: string[] = [];
    let pendingQ: string | null = null;
    let seenUserTurn = false;
    for (const t of turns) {
      if (t.role === "assistant") {
        // Only treat as a clarifier if we've seen a user turn already.
        if (seenUserTurn && t.text.trimEnd().endsWith("?")) pendingQ = t.text;
      } else {
        seenUserTurn = true;
        if (pendingQ) {
          lines.push(`Q: ${pendingQ}\nA: ${t.text}`);
          pendingQ = null;
        } else {
          lines.push(t.text);
        }
      }
    }
    return lines.join("\n\n");
  }

  function looksLikeNewTopic(text: string): boolean {
    const t = text.toLowerCase().trim();
    // Explicit reset language.
    if (/^(new question|different product|instead[,.]|actually[,.]|start over|reset)\b/.test(t)) return true;
    // Mentions a category keyword not matching the prior audit.
    const priorCat = lastAudit?.intent?.category?.toLowerCase();
    const CATEGORY_WORDS = [
      "laptop", "phone", "tv", "television", "headphone", "earbud", "chair",
      "espresso", "blender", "vacuum", "camera", "monitor", "printer", "router",
      "tablet", "watch", "mattress", "pillow", "backpack", "luggage",
    ];
    for (const word of CATEGORY_WORDS) {
      if (t.includes(word) && priorCat && !priorCat.includes(word)) return true;
    }
    return false;
  }

  function resetForNewAudit(): void {
    phase = "elicit";
    lastAudit = null;
    composer.setPlaceholder("Tell Lens what you're shopping for…");
    // Don't wipe conversation history (keeps context). Just move on.
  }

  function renderNewAuditChip(): void {
    if (document.querySelector(".lc-new-audit-chip")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lc-chip lc-new-audit-chip";
    b.textContent = "↻ Start a new shopping question";
    b.addEventListener("click", () => {
      store.clear();
      // Hide the old result card. main.ts doesn't expose a clear API so
      // we directly clear #result-body — it's a known contract.
      const body = document.getElementById("result-body");
      if (body) body.innerHTML = "";
      const resultSection = document.getElementById("result");
      if (resultSection) resultSection.setAttribute("hidden", "true");
      transcript.innerHTML = "";
      b.remove();
      lastAudit = null;
      phase = "elicit";
      const greeting =
        "What are you shopping for this time?";
      const t = store.append("assistant", greeting);
      transcript.append(botBubble(t.text));
      composer.setPlaceholder("Tell Lens what you're shopping for…");
      composer.clear();
      composer.focus();
    });
    // Judge P1-3 (2026-04-24): chipsHost may have been detached from root
    // earlier (line ~64 on session restore or line ~81 on submit). Re-attach
    // before appending so the "new audit" chip actually renders.
    if (!chipsHost.isConnected) {
      root.append(chipsHost);
    }
    chipsHost.append(b);
  }
}

function buildRecap(audit: AuditResult, topCriterion?: string): string {
  const pick = audit.specOptimal;
  // improve-D3: if search came back empty, render a real empty state, not an
  // optimistic template with a placeholder name. D17 voice alignment.
  const isEmpty =
    !pick || !pick.name || pick.name.startsWith("(no candidates") || pick.name.startsWith("(none");
  if (isEmpty) {
    return "Search came back empty this run. The category may be unindexed in the live catalog, or the live search timed out. You can narrow the query (add a budget or a specific feature) or paste a retailer URL and I'll parse the product page directly.";
  }
  const brand = pick.brand ? `${pick.brand} ` : "";
  const price = pick.price != null ? ` ($${pick.price})` : "";
  const criterionPhrase = topCriterion
    ? ` scores highest on your top criterion (${topCriterion.replace(/[_-]+/g, " ")})`
    : " fits the spread of your criteria best";
  return `Top pick: ${brand}${pick.name}${price}. It${criterionPhrase} on the transparent utility math (U = Σ wᵢ·sᵢ). The full ranking and every contribution are below. Tell me what you'd change and I'll re-rank.`;
}
