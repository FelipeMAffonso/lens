// improve-V-VISUAL — content-script floating "Lens this page" button.
//
// Drops a small shadow-DOM pill on every retailer page. Click → capture the
// viewport, send to background worker, which calls /visual-audit, which
// calls Opus 4.7 3.75MP vision to parse EVERY visible field.
//
// This is the killer for:
//   - sites that block the server web_search tool (robots.txt)
//   - Temu / AliExpress / indie Shopify where no UPC exists
//   - any page where the spec data is image-baked, not HTML
//
// Bonus: multi-segment full-page capture (scroll + concatenate) is handled
// client-side, so we respect per-tab memory without a headless renderer.

const HOST = location.hostname;

// Only inject on sites that look like product pages. Runs once per page.
// Expanded retailer + marketplace + direct-to-consumer host list (~100).
// Pattern matches any .com/.co.uk/.de/.ca/.jp/.fr/.com.au/etc suffix.
const RETAIL_HOSTS = new RegExp(
  "(^|\\.)(" +
    [
      // US big-box + marketplaces
      "amazon", "bestbuy", "walmart", "target", "homedepot", "costco", "sams",
      "lowes", "menards", "officedepot", "staples", "kohls", "macys",
      "nordstrom", "bloomingdales", "saksfifthavenue", "neimanmarcus", "tjmaxx",
      "rei", "dickssportinggoods", "academy", "newegg", "bhphotovideo", "adorama",
      "microcenter", "jcpenney", "overstock", "wayfair", "westelm", "cb2",
      "crateandbarrel", "ikea", "potterybarn", "ashleyfurniture", "bedbathandbeyond",
      // Marketplaces (3P heavy)
      "ebay", "etsy", "mercari", "poshmark", "depop", "facebook", "craigslist",
      "offerup", "alibaba", "aliexpress", "temu", "shein", "wish",
      // Grocery + food
      "kroger", "safeway", "publix", "wholefoodsmarket", "traderjoes", "instacart",
      "harristeeter", "shoprite", "freshdirect", "thrivemarket", "boxed",
      // Fashion + footwear
      "nike", "adidas", "underarmour", "lululemon", "uniqlo", "zara", "hm",
      "asos", "zappos", "shoebacca", "footlocker", "champssports",
      // Electronics DTC
      "apple", "microsoft", "google", "store.google", "sony", "samsung",
      "lg", "hp", "dell", "lenovo", "acer", "msi", "asus", "razer",
      "logitech", "anker", "bose", "sennheiser", "jbl", "sonos", "shure",
      // Home/kitchen DTC
      "dyson", "breville", "delonghi", "cuisinart", "kitchenaid", "vitamix",
      "nespresso", "keurig", "miele", "bosch-home", "geappliances", "whirlpool",
      "shark", "bissell", "hoover", "irobot", "roborock",
      // Pet + health
      "petsmart", "petco", "chewy", "cvs", "walgreens", "riteaid", "drugstore",
      // Automotive + outdoor
      "tesla", "autozone", "oreillyauto", "advanceautoparts",
      "patagonia", "northface", "columbia", "llbean", "backcountry", "cabelas",
      "basspro", "mountainhardwear", "arcteryx",
      // Shopify-style DTC brands
      "allbirds", "warbyparker", "caspersleep", "purple", "glossier", "rothys",
      "away", "peloton", "nordictrack", "onepeloton",
      // EU / UK
      "argos", "currys", "johnlewis", "selfridges", "marksandspencer", "boots",
      "lidl", "aldi", "sainsburys", "tesco", "asda",
      "mediamarkt", "saturn", "otto", "zalando", "elkjop", "elgiganten",
      // APAC
      "rakuten", "yodobashi", "biccamera", "jd", "tmall",
      // Canada
      "canadiantire", "bestbuy.ca", "costco.ca",
      // AU
      "coles", "woolworths", "bunnings",
    ].join("|") +
    ")\\.",
  "i",
);
if (!RETAIL_HOSTS.test(HOST)) {
  // Not a retailer — don't inject.
} else {
  queueMicrotask(mount);
}

function mount(): void {
  if (document.getElementById("lens-visual-pill")) return;
  const host = document.createElement("div");
  host.id = "lens-visual-pill";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .pill {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px;
      background: #cc785c;
      color: #fff;
      border: 0;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(204,120,92,0.3);
      cursor: pointer;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .pill:hover { transform: translateY(-2px); }
    .pill .dot {
      width: 8px; height: 8px; background: #fff; border-radius: 50%;
    }
    .pill[data-busy="1"] { opacity: 0.6; cursor: wait; }
    .result {
      position: absolute; right: 0; bottom: 52px; width: 380px;
      background: #fff; color: #1a1a1a;
      border: 1px solid #e8e4dd; border-radius: 12px;
      box-shadow: 0 20px 48px rgba(0,0,0,0.15);
      padding: 20px;
      max-height: 560px; overflow-y: auto;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
    }
    .result h4 {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
      display: flex; align-items: center; gap: 8px;
    }
    .result .row { padding: 6px 0; border-bottom: 1px solid #f3efe8; display: grid; grid-template-columns: 90px 1fr; gap: 12px; }
    .result .row:last-child { border-bottom: 0; }
    .result .k { color: #8a8a8a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 2px; }
    .result .v { color: #1a1a1a; }
    .result .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 999px; background: #faf4ee; border: 1px solid #f0e3d4; color: #8a5a3a; font-weight: 500; margin-right: 4px; }
    .result .close {
      position: absolute; top: 8px; right: 10px;
      background: none; border: 0; font-size: 20px; color: #8a8a8a; cursor: pointer;
    }
    .result .note {
      margin-top: 10px; padding: 10px; background: #faf4ee;
      border-radius: 6px; font-size: 11px; color: #6a4a3a;
    }
  `;
  const btn = document.createElement("button");
  btn.className = "pill";
  btn.innerHTML = '<span class="dot"></span><span>Lens this page</span>';
  btn.addEventListener("click", () => runVisualAudit(shadow, btn));
  shadow.append(style, btn);
  document.body.append(host);
}

async function runVisualAudit(shadow: ShadowRoot, btn: HTMLButtonElement): Promise<void> {
  if (btn.dataset.busy === "1") return;
  btn.dataset.busy = "1";
  const originalLabel = btn.innerHTML;
  btn.innerHTML = '<span class="dot"></span><span>Capturing + auditing…</span>';
  shadow.querySelector(".result")?.remove();

  try {
    const res: { ok: boolean; data?: Record<string, unknown>; error?: string } =
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "LENS_VISUAL_AUDIT",
            url: location.href,
            pageTitle: document.title,
            viewport: { width: innerWidth, height: innerHeight },
            userQuery: null,
          },
          (response) => resolve(response),
        );
      });
    if (!res.ok) throw new Error(res.error ?? "audit failed");
    renderResult(shadow, res.data ?? {});
  } catch (err) {
    renderError(shadow, (err as Error).message);
  } finally {
    btn.innerHTML = originalLabel;
    btn.dataset.busy = "0";
  }
}

function renderResult(shadow: ShadowRoot, data: Record<string, unknown>): void {
  const ext = (data.extracted ?? {}) as Record<string, unknown>;
  const panel = document.createElement("div");
  panel.className = "result";
  const price = ext.priceCurrent as { amount?: number; currency?: string; onSale?: boolean } | undefined;
  const rating = ext.rating as { stars?: number; count?: number } | undefined;
  const seller = ext.seller as { name?: string; type?: string } | undefined;
  const certs = (ext.certifications as string[] | undefined) ?? [];
  const bullets = (ext.topBullets as string[] | undefined) ?? [];
  const urgency = (ext.anyUrgencyBadges as string[] | undefined) ?? [];
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h4>📦 ${escapeHtml(String(ext.name ?? "Unknown product"))}</h4>
    <div class="row"><div class="k">Brand</div><div class="v">${escapeHtml(String(ext.brand ?? "—"))}</div></div>
    ${ext.model ? `<div class="row"><div class="k">Model</div><div class="v">${escapeHtml(String(ext.model))}</div></div>` : ""}
    ${price?.amount ? `<div class="row"><div class="k">Price</div><div class="v"><strong>${price.currency ?? "$"}${price.amount}</strong>${price.onSale ? '<span class="badge" style="background:#fdecec;border-color:#f5c5c5;color:#8a2f2f;margin-left:6px;">on sale</span>' : ""}</div></div>` : ""}
    ${rating?.stars ? `<div class="row"><div class="k">Rating</div><div class="v">${rating.stars}★ (${rating.count ?? "?"} reviews)</div></div>` : ""}
    ${seller?.name ? `<div class="row"><div class="k">Seller</div><div class="v">${escapeHtml(seller.name)} <span class="badge">${seller.type ?? "unknown"}</span></div></div>` : ""}
    ${ext.claimedOrigin ? `<div class="row"><div class="k">Claimed<br>origin</div><div class="v">${escapeHtml(String(ext.claimedOrigin))}</div></div>` : ""}
    ${certs.length > 0 ? `<div class="row"><div class="k">Certs</div><div class="v">${certs.map((c) => `<span class="badge">${escapeHtml(c)}</span>`).join(" ")}</div></div>` : ""}
    ${urgency.length > 0 ? `<div class="row"><div class="k">Urgency<br>cues</div><div class="v">${urgency.map((u) => `<span class="badge" style="background:#fdf3dc;border-color:#e5c57a;color:#9c6b14;">${escapeHtml(u)}</span>`).join(" ")}</div></div>` : ""}
    ${bullets.length > 0 ? `<div class="row"><div class="k">Bullets</div><div class="v"><ul style="margin:0;padding-left:18px;">${bullets.slice(0, 3).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div></div>` : ""}
    <div class="note">Parsed by Opus 4.7 vision. SKU persisted as <code>${escapeHtml(String(data.skuId ?? "?"))}</code> in the Lens catalog. Triangulated with GS1 origin, recall database, and (if available) Keepa price history.</div>
  `;
  shadow.append(panel);
  panel.querySelector(".close")?.addEventListener("click", () => panel.remove());
}

function renderError(shadow: ShadowRoot, msg: string): void {
  const panel = document.createElement("div");
  panel.className = "result";
  panel.innerHTML = `<button class="close" aria-label="Close">×</button>
    <h4>Lens couldn't parse this page</h4>
    <p>${escapeHtml(msg)}</p>
    <div class="note">Make sure you've signed in at lens-b1h.pages.dev. If the page is behind a login wall, screenshot it manually and paste on the web app.</div>`;
  shadow.append(panel);
  panel.querySelector(".close")?.addEventListener("click", () => panel.remove());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}