import type { AuditResult, UserIntent } from "@lens/shared";

export interface CriterionShape {
  name: string;
  weight: number;
  direction?: "higher_is_better" | "lower_is_better" | "target" | "binary" | undefined;
  confidence?: number | undefined;
  source?: UserIntent["criteria"][number]["source"] | undefined;
  rationale?: string | undefined;
}

export function preferenceModelPanel(r: AuditResult): string {
  const model = r.intent.preferenceModel;
  if (!model) return "";
  const privacy = model.privacy ?? {
    usesExternalBehavior: false,
    consentRequiredFor: [],
  };
  const layers = model.layers
    .map(
      (layer) =>
        `<span class="pref-model-layer pref-model-layer-${esc(layer.status)}" title="${esc(layer.rationale)}">${esc(humanizeCriterion(layer.layer))}: ${esc(layer.status.replace(/_/g, " "))}</span>`,
    )
    .join("");
  const confidence = Math.round(model.confidence * 100);
  const consentItems = privacy.consentRequiredFor ?? [];
  const consent = consentItems.slice(0, 3).map((x) => esc(x)).join(", ");
  return `
    <div class="preference-model-panel">
      <div class="pref-model-head">
        <strong>Utility model derived before ranking</strong>
        <span>${confidence}% confidence${model.needsClarification ? " · clarification recommended" : ""}</span>
      </div>
      <div class="pref-layer-row">${layers}</div>
      <p>
        User control is part of the math: edit weights here, answer clarifiers, or disable saved profiles,
        receipts, Plaid, purchase monitors, and push workflows independently. External behavior is
        ${privacy.usesExternalBehavior ? "being used with consent" : "not used for this run"}.
        Sensitive sources require opt-in: ${consent}${consentItems.length > 3 ? ", ..." : ""}.
      </p>
    </div>
  `;
}

export function renderCriteriaChips(host: HTMLElement, criteria: CriterionShape[]): void {
  host.innerHTML = "";
  const sorted = [...criteria].sort((a, b) => b.weight - a.weight);
  for (const c of sorted) {
    const pct = Math.max(0, Math.min(100, Math.round(c.weight * 100)));
    const source = c.source ? humanizeCriterion(c.source) : "inferred";
    const confidence = c.confidence !== undefined ? `${Math.round(c.confidence * 100)}% confidence` : "confidence not reported";
    const rationale = c.rationale ?? `${source}; ${confidence}`;
    const chip = document.createElement("div");
    chip.className = "criterion-chip";
    chip.innerHTML = `
      <div class="criterion-chip-head">
        <span class="criterion-chip-name">${esc(humanizeCriterion(c.name))}</span>
        <span class="criterion-chip-priority">${priorityLabel(c.weight)}</span>
      </div>
      <div class="criterion-chip-bar" aria-hidden="true">
        <span style="width:${pct}%"></span>
      </div>
      <div class="criterion-chip-meta">${esc(source)} · ${esc(confidence)}</div>
    `;
    chip.setAttribute("role", "group");
    chip.setAttribute("title", rationale);
    chip.setAttribute("aria-label", `${humanizeCriterion(c.name)}: ${priorityLabel(c.weight)} (weight ${pct}%). ${source}; ${confidence}. ${rationale}`);
    host.append(chip);
  }
}

function priorityLabel(weight: number): string {
  if (weight >= 0.4) return "dominant";
  if (weight >= 0.25) return "high";
  if (weight >= 0.15) return "medium";
  return "low";
}

function humanizeCriterion(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b(cpu|gpu|usb|hdr|oled|qled|ssd|ram|ai|cadr|sku)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function esc(s: string | number | boolean | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
