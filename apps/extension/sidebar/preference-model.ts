export interface SidebarCriterion {
  name: string;
  weight: number;
  direction: string;
  confidence?: number;
  source?: string;
  rationale?: string;
}

export interface SidebarPreferenceModel {
  version: "layered-utility-v1";
  confidence: number;
  needsClarification: boolean;
  layers: Array<{
    layer: string;
    status: "used" | "missing" | "requires_consent" | "user_controlled";
    signals: number;
    rationale: string;
  }>;
  userControls: string[];
  privacy: {
    dataTier: string;
    usesExternalBehavior: boolean;
    consentRequiredFor: string[];
    retention: string;
  };
}

export function preferenceModelCard(
  model: SidebarPreferenceModel | undefined,
  criteria: SidebarCriterion[],
): string {
  if (!model) {
    return `
      <div class="pref-mini pref-mini-muted">
        <div class="pref-mini-title">Utility model</div>
        <p>Lens ranked from the visible criteria. Preference provenance was not returned for this audit.</p>
      </div>
    `;
  }

  const usedLayers = model.layers.filter((l) => l.status === "used");
  const consentLayers = model.layers.filter((l) => l.status === "requires_consent");
  const topCriteria = criteria
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  return `
    <div class="pref-mini">
      <div class="pref-mini-head">
        <div>
          <div class="pref-mini-title">Utility model derived before ranking</div>
          <p>${Math.round(model.confidence * 100)}% confidence${model.needsClarification ? " - clarification recommended" : ""}</p>
        </div>
      </div>
      <div class="pref-mini-chips">
        ${topCriteria.map(criterionChip).join(" ")}
      </div>
      <div class="pref-mini-grid">
        <div>
          <strong>Used</strong>
          <span>${usedLayers.length > 0 ? usedLayers.map((l) => titleCase(l.layer)).join(", ") : "visible criteria only"}</span>
        </div>
        <div>
          <strong>Not used without consent</strong>
          <span>${consentLayers.length > 0 ? consentLayers.map((l) => titleCase(l.layer)).join(", ") : "Gmail, purchases, and financial signals"}</span>
        </div>
      </div>
      <p class="pref-mini-control">${esc(model.userControls[0] ?? "You can edit, disable, export, or delete preference sources.")}</p>
    </div>
  `;
}

function criterionChip(c: SidebarCriterion): string {
  const source = c.source ? titleCase(c.source) : "Visible";
  const conf = typeof c.confidence === "number" ? ` - ${Math.round(c.confidence * 100)}%` : "";
  return `<span title="${esc(c.rationale ?? "")}">${esc(humanize(c.name))}<small>${esc(source)}${conf}</small></span>`;
}

function humanize(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function titleCase(raw: string): string {
  return humanize(raw).replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s: string | number | boolean | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}
