// F15 — Public Lens Score API.
//
// GET /score?url=<product>&category=<slug>&criteria=<nat-lang>
//   → runs a query-mode audit, returns { score, breakdown, packVersion }
//
// Scoring pipeline: if `category` + `criteria` are both provided, re-use the
// existing audit engine in query mode with a synthetic prompt. The top
// candidate's utilityScore becomes the Lens Score (0..1). The breakdown array
// is the per-criterion contribution map.
//
// Cache: KV key `score:<sha256(url+category+criteria)>` with 1h TTL.

import { z } from "zod";

export const ScoreQuerySchema = z.object({
  url: z.string().min(1).max(2000).optional(),
  category: z.string().min(1).max(200).optional(),
  criteria: z.string().min(1).max(2000),
});

export type ScoreQuery = z.infer<typeof ScoreQuerySchema>;

export interface ScoreResult {
  score: number;
  breakdown: Array<{ criterion: string; weight: number; score: number; contribution: number }>;
  packVersion: string;
  category: string;
  productName?: string;
  brand?: string;
  price?: number | null;
  generatedAt: string;
  cached?: boolean;
}

export async function computeScore(
  query: ScoreQuery,
  audit: (input: { kind: "query"; userPrompt: string; category?: string }) => Promise<{
    specOptimal: { name: string; brand?: string; price?: number | null; utilityScore: number; utilityBreakdown: Array<{ criterion: string; weight: number; score: number; contribution: number }> };
    intent: { category: string };
  }>,
): Promise<ScoreResult> {
  const promptParts = [query.criteria];
  if (query.url) promptParts.push(`(evaluating ${query.url})`);
  const input: { kind: "query"; userPrompt: string; category?: string } = {
    kind: "query" as const,
    userPrompt: promptParts.join(" "),
  };
  if (query.category) input.category = query.category;
  const result = await audit(input);
  return {
    score: Number((result.specOptimal.utilityScore ?? 0).toFixed(3)),
    breakdown: result.specOptimal.utilityBreakdown,
    packVersion: "1.0.0",
    category: result.intent.category,
    productName: result.specOptimal.name,
    ...(result.specOptimal.brand !== undefined ? { brand: result.specOptimal.brand } : {}),
    price: result.specOptimal.price ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/** The CDN-embeddable snippet. Returned from GET /embed.js. */
export const EMBED_JS = `(function(){"use strict";
var API = "https://lens-api.webmarinelli.workers.dev";
function render(el, data){
  el.innerHTML = ""+
    "<span style=\\"display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #e5e8ec;border-radius:999px;font:500 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1a1a1a;\\">"+
      "<span style=\\"width:6px;height:6px;border-radius:999px;background:#DA7756;\\"></span>"+
      "<span>Lens <strong>"+(Math.round(data.score*100)/100).toFixed(2)+"</strong></span>"+
      "<a href=\\"https://lens-b1h.pages.dev\\" target=\\"_blank\\" style=\\"color:#6a7488;text-decoration:none;margin-left:4px;\\">↗</a>"+
    "</span>";
}
function renderErr(el){ el.textContent = "Lens score unavailable"; el.style.opacity = "0.55"; }
function init(el){
  var url = el.getAttribute("data-url");
  var category = el.getAttribute("data-category") || "";
  var criteria = el.getAttribute("data-criteria") || "overall quality and value";
  var qs = "?criteria=" + encodeURIComponent(criteria) + (category ? "&category=" + encodeURIComponent(category) : "") + (url ? "&url=" + encodeURIComponent(url) : "");
  fetch(API + "/score" + qs).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ if(d && typeof d.score === "number") render(el, d); else renderErr(el); }).catch(function(){ renderErr(el); });
}
document.addEventListener("DOMContentLoaded", function(){
  document.querySelectorAll("[data-lens-score]").forEach(init);
});
window.LensScore = { init: init };
})();`;
