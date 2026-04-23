-- 0014_triggers.sql — Lens Triggers (privacy-preserving passive monitoring).
-- See docs/TRIGGERS.md for the full design. Server stores only hashes.

CREATE TABLE IF NOT EXISTS trigger_catalog (
  id              TEXT PRIMARY KEY,                        -- 'dp.fake-urgency'
  category        TEXT NOT NULL,                           -- 'page' | 'email' | 'notification' | 'journey'
  severity        TEXT NOT NULL DEFAULT 'moderate',        -- 'low' | 'moderate' | 'high' | 'critical'
  pack_slug       TEXT,                                    -- cross-ref to dark-pattern / fee / intervention pack
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '1.0.0',
  retired         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trigger_hit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_id      TEXT NOT NULL REFERENCES trigger_catalog(id) ON DELETE CASCADE,
  host            TEXT,                                    -- "amazon.com", "marriott.com", or "email"
  hit_hash        TEXT NOT NULL,                           -- HMAC-SHA-256 client-side
  occurred_at     TEXT NOT NULL,                           -- client-reported, minute resolution
  reported_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- NO content, NO url, NO body, NO user identifier. Only the fact of the hit.
  UNIQUE (trigger_id, host, hit_hash, occurred_at)
);
CREATE INDEX IF NOT EXISTS idx_trigger_hit_trigger ON trigger_hit(trigger_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_hit_host ON trigger_hit(host, reported_at DESC);

-- Seed the v0 trigger catalog.
INSERT OR IGNORE INTO trigger_catalog (id, category, severity, pack_slug, title, description) VALUES
  ('dp.fake-urgency',       'page',  'moderate', 'dark-pattern/fake-urgency',    'Fake urgency', 'Countdown + "last chance" text co-occur on cart or checkout.'),
  ('dp.hidden-cost',        'page',  'high',     'dark-pattern/hidden-costs',    'Hidden cost',  'A fee keyword appears inside cart total region and the subtotal does not match the total.'),
  ('dp.forced-continuity',  'page',  'high',     'dark-pattern/forced-continuity','Forced continuity','Free-trial language plus pre-selected auto-renew.'),
  ('dp.sneak-into-basket',  'page',  'high',     'dark-pattern/sneak-into-basket','Sneak into basket','Item appears in cart that the user did not add.'),
  ('dp.preselection',       'page',  'moderate', 'dark-pattern/preselection',    'Preselection', 'Pre-checked opt-in checkbox.'),
  ('dp.fake-review',        'page',  'moderate', 'dark-pattern/fake-social-proof','Fake review',  'Review density + language homogeneity outlier.'),
  ('dp.price-drift',        'page',  'moderate', 'fee/drip-pricing',             'Price drift',  'Cart subtotal differs from product-page price by more than 5% pre-tax.'),
  ('dp.drip-fees',          'page',  'high',     'fee/drip-pricing',             'Drip fees',    'More than 3 distinct fee line items at checkout.'),
  ('dp.bait-and-switch',    'page',  'high',     'dark-pattern/bait-and-switch', 'Bait-and-switch','Final cart item differs from last viewed product.'),
  ('em.phishing-lookalike', 'email', 'critical', 'dark-pattern/disguised-ads',   'Phishing lookalike','Display name mimics a retailer, domain is not on the authorized-sender list.'),
  ('em.fake-shipping-update','email','high',     'dark-pattern/disguised-ads',   'Fake shipping update','Shipping-update subject from sender not in your purchase history.'),
  ('em.subscription-auto-renew','email','moderate','fee/subscription-auto-renewal','Subscription auto-renew','Renewing within 7 days with a charge amount.'),
  ('em.coupon-phishing',    'email', 'high',     'dark-pattern/disguised-ads',   'Coupon phishing','Discount email with external tracker link and urgency verb.'),
  ('em.breach-notification','email', 'critical', 'regulation/us-federal-ftc-fake-reviews','Breach notification','Security-incident email cross-referenced with HIBP breach list.'),
  ('sess.price-drift-checkout','journey','high', 'fee/drip-pricing',             'Session price drift','Session first-page price vs. final checkout total delta > 10%.'),
  ('sess.cart-switch',      'journey','high',    'dark-pattern/bait-and-switch', 'Session cart switch','Final cart item was never on any product page in this session.'),
  ('sess.drip-layers',      'journey','high',    'fee/drip-pricing',             'Drip layers',  'More than 3 fees added incrementally across pages in one session.'),
  ('sess.forced-upsell',    'journey','high',    'dark-pattern/nagging',         'Forced upsell','Post-checkout upsell page with pre-selected second product.'),
  ('noti.scarcity-spam',    'notification','low', 'dark-pattern/fake-scarcity',   'Notification scarcity spam','More than 3 "only-X-left" pushes in 24 hours from one retailer app.'),
  ('noti.price-drop-match', 'notification','low', NULL,                           'Price drop matches purchase','Retailer app push that matches an item in the user\u2019s purchase history.');