// F8 — Per-host Stage-2 consent.
// Before the extension POSTs any page excerpt to the worker for LLM
// verification (Stage 2 of the dark-pattern pipeline per AMBIENT_MODEL §2),
// the user must have granted consent for the current host.
//
// States:
//   "always" — always send excerpts on this host
//   "ask"    — prompt per scan (default for unknown hosts)
//   "never"  — never send; Stage 2 is skipped entirely
//
// Storage keys: `lens.consent.v1.<host>` → one of the 3 values above.

export type ConsentState = "always" | "ask" | "never";

const KEY_PREFIX = "lens.consent.v1";

function keyOf(host: string): string {
  return `${KEY_PREFIX}.${host}`;
}

function read(host: string): ConsentState | null {
  try {
    const v = (typeof localStorage !== "undefined" && localStorage.getItem(keyOf(host))) || null;
    if (v === "always" || v === "ask" || v === "never") return v;
    return null;
  } catch {
    return null;
  }
}

function write(host: string, state: ConsentState): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(keyOf(host), state);
  } catch {
    // silent
  }
}

export function getConsent(host: string): ConsentState | null {
  return read(host);
}

export function setConsent(host: string, state: ConsentState): void {
  write(host, state);
}

export function resetConsent(host: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(keyOf(host));
  } catch {
    // silent
  }
}

/**
 * Should we send a Stage-2 excerpt for this host right now?
 * Returns true only if the user has explicitly set "always".
 * "ask" + null mean the caller should invoke askForConsent() first.
 * "never" means do nothing.
 */
export function canStage2(host: string): boolean {
  return read(host) === "always";
}

/**
 * Render the one-time consent modal. Returns the decision. Promise resolves
 * when the user clicks a choice (or Escape = "ask"). Non-blocking for the
 * host page (Shadow-DOM isolated, fixed-position, dismissible).
 */
export function askForConsent(host: string, patternName: string): Promise<ConsentState> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(15,20,30,0.45);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    const shadow = container.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host, button { all: initial; box-sizing: border-box; }
        * { box-sizing: border-box; }
        .modal {
          background: #fff; color: #1a1a1a; max-width: 440px; width: 100%;
          border-radius: 8px; border: 1px solid #e5e8ec; padding: 24px;
          box-shadow: 0 16px 48px rgba(15,20,30,0.25);
          font: 14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        h2 { margin: 0 0 8px; font-size: 17px; letter-spacing: -0.01em; font-weight: 700; color: #1a1a1a; }
        p { margin: 0 0 14px; color: #4a5260; font-size: 13px; }
        .host { font-family: "SF Mono", Menlo, Consolas, monospace; color: #1a1a1a; background: #f4f6f8; padding: 1px 6px; border-radius: 3px; }
        .actions { display: grid; gap: 8px; margin-top: 16px; }
        .btn {
          border: 1px solid #e5e8ec; background: #fff; color: #1a1a1a;
          padding: 10px 14px; border-radius: 6px; cursor: pointer;
          font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          text-align: left; transition: background 150ms ease, border-color 150ms ease;
        }
        .btn:hover { border-color: #DA7756; background: rgba(218,119,86,0.06); }
        .btn.primary { background: #DA7756; color: #fff; border-color: #DA7756; }
        .btn.primary:hover { background: #c86a4a; }
        .btn.muted { color: #6a7488; }
        .btn .sub { color: #6a7488; font-weight: 400; display: block; margin-top: 2px; font-size: 12px; }
        .btn.primary .sub { color: rgba(255,255,255,0.82); }
      </style>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lens-consent-title">
        <h2 id="lens-consent-title">Lens spotted something on <span class="host">HOST</span></h2>
        <p>It looks like a <strong>PATTERN</strong> pattern. To confirm, Lens can send a short excerpt (~200 characters) of the matched element to its API for verification. Your choice is remembered for this host only.</p>
        <div class="actions">
          <button type="button" class="btn primary" data-val="always">
            Always allow on HOST
            <span class="sub">Recommended if you trust Lens to audit this site.</span>
          </button>
          <button type="button" class="btn" data-val="ask">
            Ask each time
            <span class="sub">Default. You'll see this prompt on future detections.</span>
          </button>
          <button type="button" class="btn muted" data-val="never">
            Never send from HOST
            <span class="sub">Lens will skip Stage-2 verification on this host.</span>
          </button>
        </div>
      </div>
    `;
    // Fill in placeholders
    shadow.querySelectorAll<HTMLElement>(".host, #lens-consent-title .host").forEach((el) => {
      el.textContent = host;
    });
    shadow.querySelector<HTMLElement>("p strong")!.textContent = patternName;
    shadow.querySelectorAll<HTMLButtonElement>(".btn").forEach((btn) => {
      const txt = btn.firstChild as Text | null;
      if (txt && txt.textContent) txt.textContent = txt.textContent.replace("HOST", host);
    });
    shadow.querySelectorAll<HTMLButtonElement>("[data-val]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-val") as ConsentState;
        setConsent(host, val);
        container.remove();
        resolve(val);
      });
    });

    document.body.append(container);
    // ESC closes → "ask" (default, non-destructive)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        container.remove();
        resolve("ask");
      }
    };
    document.addEventListener("keydown", onKey);
  });
}
