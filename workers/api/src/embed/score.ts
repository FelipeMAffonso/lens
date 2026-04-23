// VISION #32 / CJ-W52 — Lens Score embed widget.
//
// External sites (Wirecutter-style reviews, bloggers, news orgs) can embed
// Lens's independent score inline:
//
//   <script src="https://lens-api.webmarinelli.workers.dev/embed/lens-score.js"></script>
//   <div data-lens-score data-url="https://www.amazon.com/dp/B0xxxx"></div>
//
// The script fetches /embed/score?url=... and renders a small read-only tile:
//   ┌──────────────────────────────────────┐
//   │ LENS SCORE · De'Longhi Stilosa       │
//   │ Spec-utility: 0.42 / 1.00            │
//   │ 3 sources triangulated · 0 recalls   │
//   │ Made in: Italy · Cert: ENERGY STAR   │
//   │                            lens-b1h →│
//   └──────────────────────────────────────┘
//
// Read-only, cache-control 5 min, CORS open. No affiliate links, no tracking.

import type { Context } from "hono";
import type { Env } from "../index.js";

const EMBED_JS = `
(function() {
  var tiles = document.querySelectorAll('[data-lens-score]');
  if (tiles.length === 0) return;
  tiles.forEach(function(tile) {
    var u = tile.getAttribute('data-url');
    if (!u) return;
    var base = 'https://lens-api.webmarinelli.workers.dev/embed/score';
    fetch(base + '?url=' + encodeURIComponent(u))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var d = data || {};
        var html = \`
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 13px; border: 1px solid #e8e4dd; border-radius: 8px; padding: 14px 16px; background: #fff; max-width: 340px; color: #1a1a1a;">
            <div style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a5a3a; font-weight: 600; margin-bottom: 6px;">LENS SCORE · <span style="color:#cc785c">independent</span></div>
            <div style="font-weight: 600; margin-bottom: 6px;">\${d.name ? d.name.replace(/[<>]/g,'') : 'Unknown product'}</div>
            \${d.specUtility !== null && d.specUtility !== undefined ? \`<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
              <div style="height:6px;width:100%;background:#faf4ee;border-radius:999px;position:relative;">
                <div style="height:6px;width:\${Math.round((d.specUtility||0)*100)}%;background:#cc785c;border-radius:999px;"></div>
              </div>
              <div style="font-weight:600;font-variant-numeric:tabular-nums;">\${(d.specUtility||0).toFixed(2)}</div>
            </div>\` : ''}
            <div style="font-size:11px;color:#6a6a6a;line-height:1.5;margin-top:6px;">
              \${d.nSources || 0} source\${(d.nSources||0)===1?'':'s'} triangulated ·
              \${d.recallsCount || 0} recall\${(d.recallsCount||0)===1?'':'s'} ·
              \${d.originCountry ? 'Origin: ' + d.originCountry : ''}
            </div>
            \${d.triangulatedPrice ? \`<div style="font-size:11px;color:#6a6a6a;margin-top:4px;">Consensus price: <strong style="color:#1a1a1a;">$\${(d.triangulatedPrice.medianCents/100).toFixed(2)}</strong> across \${d.triangulatedPrice.nSources} sources</div>\` : ''}
            <a href="https://lens-b1h.pages.dev" target="_blank" style="display:inline-block;font-size:10px;color:#cc785c;text-decoration:none;margin-top:8px;">lens-b1h.pages.dev ↗</a>
          </div>
        \`;
        tile.innerHTML = html;
      })
      .catch(function() {
        tile.innerHTML = '<div style="font-family:system-ui;font-size:11px;color:#8a8a8a;padding:8px;border:1px dashed #ccc;border-radius:4px;">Lens Score unavailable</div>';
      });
  });
})();
`.trim();

export async function handleEmbedJs(c: Context<{ Bindings: Env }>): Promise<Response> {
  return new Response(EMBED_JS, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}

export async function handleEmbedScore(c: Context<{ Bindings: Env }>): Promise<Response> {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "missing_url" }, 400);
  if (!c.env.LENS_D1) {
    return c.json({ bootstrapping: true }, 200, { "access-control-allow-origin": "*" });
  }
  try {
    // Try to match the URL to a sku_catalog row via sku_source_link.external_url.
    const row = await c.env.LENS_D1.prepare(
      `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.image_url,
              tp.median_cents, tp.p25_cents, tp.p75_cents, tp.n_sources
         FROM sku_source_link ssl
         JOIN sku_catalog sc ON sc.id = ssl.sku_id
         LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
        WHERE ssl.external_url = ? AND ssl.active = 1
        LIMIT 1`,
    ).bind(url).first<{
      id: string;
      canonical_name: string;
      brand_slug: string;
      image_url: string | null;
      median_cents: number | null;
      p25_cents: number | null;
      p75_cents: number | null;
      n_sources: number | null;
    }>();

    if (!row) {
      return c.json(
        { name: null, specUtility: null, nSources: 0, recallsCount: 0, originCountry: null, triangulatedPrice: null, url },
        200,
        { "access-control-allow-origin": "*", "cache-control": "public, max-age=120" },
      );
    }

    const { results: srcs } = await c.env.LENS_D1.prepare(
      "SELECT COUNT(*) as n FROM sku_source_link WHERE sku_id = ? AND active = 1",
    ).bind(row.id).all<{ n: number }>();
    const { results: recs } = await c.env.LENS_D1.prepare(
      "SELECT COUNT(*) as n FROM recall_affects_sku WHERE sku_id = ?",
    ).bind(row.id).all<{ n: number }>();
    const origin = await c.env.LENS_D1.prepare(
      `SELECT specs_json FROM sku_source_link WHERE sku_id = ? AND source_id = 'gs1-origin' LIMIT 1`,
    ).bind(row.id).first<{ specs_json: string | null }>();
    let originCountry: string | null = null;
    if (origin?.specs_json) {
      try {
        const o = JSON.parse(origin.specs_json);
        originCountry = o.country_name ?? null;
      } catch {
        // ignore
      }
    }

    return c.json({
      name: row.canonical_name,
      brand: row.brand_slug,
      imageUrl: row.image_url,
      specUtility: null, // pure spec-utility requires the user's criteria; embed defaults to null
      nSources: srcs?.[0]?.n ?? 0,
      recallsCount: recs?.[0]?.n ?? 0,
      originCountry,
      triangulatedPrice: row.median_cents
        ? { medianCents: row.median_cents, p25Cents: row.p25_cents, p75Cents: row.p75_cents, nSources: row.n_sources }
        : null,
      url,
      dashboardUrl: `https://lens-b1h.pages.dev/?mode=url&url=${encodeURIComponent(url)}`,
    }, 200, {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
}