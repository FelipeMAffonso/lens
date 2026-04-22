// CJ-W53 — the chat surface. Ties together bubbles + composer + rotator,
// drives the Stage 1 clarify loop / Stage 2 audit / Stage 3 recommend +
// card / Stage 4 follow-up answer loop.

import type { AuditResult } from "@lens/shared";
import { renderResult } from "../main.js";
import { botBubble, typingBubble, userBubble } from "./bubbleRenderer.js";
import { mountComposer, type ComposerHandles } from "./composer.js";
import { ConversationStore } from "./ConversationStore.js";
import { mountRotatingStatus, type RotatingStatusHandle } from "./rotatingStatus.js";
import { shouldTriggerAudit } from "./stages.js";

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

  // First bot greeting — the Study-3-faithful opener. If the user already has
  // saved turns for this session, we just replay them instead.
  const preExisting = store.all();
  if (preExisting.length === 0) {
    const greeting =
      "Hey! I'm Lens — your independent shopping agent. What are you thinking of buying?";
    const t = store.append("assistant", greeting);
    transcript.append(botBubble(t.text));
    renderSeedChips();
  } else {
    for (const turn of preExisting) {
      transcript.append(turn.role === "user" ? userBubble(turn.text) : botBubble(turn.text));
    }
    chipsHost.remove();
  }
  composer.focus();

  composer.onSubmit(async (text) => {
    if (phase === "generating") return;
    chipsHost.remove();
    // Append user bubble immediately (optimistic).
    const userTurn = store.append("user", text);
    transcript.append(userBubble(userTurn.text));
    composer.clear();
    scrollBottom();

    if (phase === "followup") {
      await runFollowup(text);
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
        kind: "clarify" | "ready" | "error";
        question?: string;
        message?: string;
      };
      if (body.kind === "ready") {
        await runAudit();
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

  async function runAudit(): Promise<void> {
    phase = "generating";
    composer.setDisabled(true);
    composer.setPlaceholder("Hold on — Lens is searching real products…");
    rotator = mountRotatingStatus(transcript);
    scrollBottom();

    // Fold the full conversation into a single audit prompt. Rank engine reads
    // free text and extracts criteria from it.
    const userPrompt = buildAuditPrompt();

    try {
      const res = await fetch(`${API_BASE}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "query", userPrompt }),
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
      composer.setPlaceholder("Ask a follow-up — e.g. \"what about the runner-up?\"");
      composer.focus();
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
        "Start a new shopping question first — I don't have an audit to talk about yet.",
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
        "I couldn't run that follow-up right now. The full ranking is still below — drag the sliders to re-weight if your priorities shifted.",
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
      { label: "💻 Laptop for coding under $1000", value: "I need a laptop under $1000 for coding — battery life, keyboard, and reliability matter most" },
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
    // Join all user turns into a single rich prompt. The audit pipeline's
    // extract node is already tolerant of paragraph-style prose.
    const userTurns = store.all().filter((t) => t.role === "user").map((t) => t.text);
    return userTurns.join("\n\n");
  }
}

function buildRecap(audit: AuditResult, topCriterion?: string): string {
  const pick = audit.specOptimal;
  const brand = pick.brand ? `${pick.brand} ` : "";
  const price = pick.price != null ? ` ($${pick.price})` : "";
  const criterionPhrase = topCriterion
    ? ` matches your top criterion (${topCriterion.replace(/[_-]+/g, " ")})`
    : " fits your criteria best";
  return `Based on what you told me, Lens's pick is ${brand}${pick.name}${price}. It${criterionPhrase} per the transparent utility math. The full ranking is below — drag the sliders to re-weight.`;
}
