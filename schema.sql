-- The Agent Bazaar — schema
-- SQLite dialect (works on local file + Turso/libSQL unchanged).
--
-- Design rule: money-adjacent tables are append-only. Corrections happen as
-- NEW rows (status transitions via new mandate/payment/approval records), so
-- the audit trail can never be rewritten. Enforced with triggers, not hope.

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  tags        TEXT NOT NULL DEFAULT '[]',      -- JSON array
  stall_x     REAL NOT NULL DEFAULT 0,         -- bazaar visualization coords
  stall_y     REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One shopping session per agent run (harness / MCP client / REST caller).
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,                    -- e.g. "claude/gift-buyer"
  provider   TEXT NOT NULL,                    -- claude | mcp-client | rest
  persona    TEXT NOT NULL DEFAULT '',
  budget_paise INTEGER NOT NULL DEFAULT 0,     -- declared by the "user" at consent time
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  status     TEXT NOT NULL DEFAULT 'active'    -- active | done | aborted
);

-- Ed25519 keypairs for the three mandate actors (user / agent / merchant).
-- Generated on first use and persisted here so signatures stay verifiable
-- across restarts. Demo-grade: in production the user key lives on their
-- trusted surface, never server-side (see docs/LIMITATIONS.md).
CREATE TABLE IF NOT EXISTS actor_keys (
  actor       TEXT PRIMARY KEY CHECK (actor IN ('user','agent','merchant')),
  public_key  TEXT NOT NULL,                   -- SPKI PEM
  private_key TEXT NOT NULL,                   -- PKCS8 PEM (demo only!)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The mandate chain: INTENT -> CART -> PAYMENT, hash-linked, signed.
-- signed_by: user (simulated trusted surface) | agent | merchant
-- status: pending | signed | fulfilled | rejected | expired | invalidated
CREATE TABLE IF NOT EXISTS mandates (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  type         TEXT NOT NULL CHECK (type IN ('INTENT','CART','PAYMENT')),
  parent_hash  TEXT,                           -- hash of parent mandate payload (chain linkage)
  payload_json TEXT NOT NULL,                  -- canonical JSON (sorted keys)
  hash         TEXT NOT NULL,                  -- sha256(canonical payload)
  signed_by    TEXT NOT NULL CHECK (signed_by IN ('user','agent','merchant')),
  sig          TEXT NOT NULL DEFAULT '',       -- ed25519 signature over canonical payload
  alg          TEXT NOT NULL DEFAULT 'ed25519',
  status       TEXT NOT NULL DEFAULT 'pending',
  iat          INTEGER NOT NULL,               -- issued-at epoch seconds
  exp          INTEGER NOT NULL                -- expiry epoch seconds
);

CREATE TRIGGER IF NOT EXISTS mandates_no_update
BEFORE UPDATE ON mandates
BEGIN SELECT RAISE(ABORT, 'mandates is append-only'); END;

CREATE TRIGGER IF NOT EXISTS mandates_no_delete
BEFORE DELETE ON mandates
BEGIN SELECT RAISE(ABORT, 'mandates is append-only'); END;

-- Policy rules evaluated by lib/policy/engine.ts (pure function).
-- kind: daily_cap | velocity | category_deny | max_single
-- config_json examples:
--   daily_cap:     {"limit_paise": 50000}
--   velocity:      {"max_txns": 5, "window_minutes": 60}
--   category_deny: {"category": "cricket"}
--   max_single:    {"limit_paise": 30000}
CREATE TABLE IF NOT EXISTS policy_rules (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT,                            -- NULL = applies to all agents
  kind        TEXT NOT NULL CHECK (kind IN ('daily_cap','velocity','category_deny','max_single')),
  config_json TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every evaluation is recorded, allow or not. This IS the explainability bar.
CREATE TABLE IF NOT EXISTS policy_decisions (
  id            TEXT PRIMARY KEY,
  mandate_id    TEXT NOT NULL REFERENCES mandates(id),
  verdict       TEXT NOT NULL CHECK (verdict IN ('allow','gate','deny')),
  reasons_json  TEXT NOT NULL,                 -- [{rule_id, kind, detail}]
  evaluated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Human-in-the-loop queue ("shopkeeper bell").
CREATE TABLE IF NOT EXISTS approvals (
  id           TEXT PRIMARY KEY,
  mandate_id   TEXT NOT NULL REFERENCES mandates(id),
  reason       TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT,
  decided_by   TEXT,
  outcome      TEXT CHECK (outcome IN ('approved','rejected') OR outcome IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_approvals_open ON approvals(outcome) WHERE outcome IS NULL;

-- Real Razorpay rail objects, one row per checkout attempt.
-- status: checkout_open | captured | failed | recovered | cancelled
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  mandate_id      TEXT NOT NULL REFERENCES mandates(id),
  reference_id    TEXT UNIQUE,                 -- our id echoed back by webhooks
  rzp_order_id    TEXT,
  rzp_link_id     TEXT,
  rzp_payment_id  TEXT,
  amount_paise    INTEGER NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'created',
  failure_reason  TEXT,
  raw_json        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(rzp_order_id);

-- Upsell evidence: presented suggestion, accepted left NULL until acted on.
CREATE TABLE IF NOT EXISTS suggestions (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  cart_mandate_id TEXT,
  basis        TEXT NOT NULL DEFAULT 'complementary-category',
  presented_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted     INTEGER                        -- NULL = no answer yet
);

-- Campaigns: bundle discounts, flash sales, cross-sell offers.
-- Merchanter-configured promotions that agents can discover and apply.
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,                 -- "Diwali Bundle Deal"
  description   TEXT NOT NULL DEFAULT '',      -- "Buy 2+ mithai items, get 15% off"
  kind          TEXT NOT NULL CHECK (kind IN ('bundle','flash_sale','cross_sell')),
  config_json   TEXT NOT NULL,                 -- campaign-specific rules (see engine)
  starts_at     TEXT NOT NULL,                 -- ISO timestamp
  ends_at       TEXT NOT NULL,                 -- ISO timestamp
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every campaign application is recorded — growth evidence, auditable.
CREATE TABLE IF NOT EXISTS campaign_applications (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT NOT NULL REFERENCES campaigns(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  cart_mandate_id TEXT,
  discount_paise  INTEGER NOT NULL,            -- how much was taken off
  final_paise     INTEGER NOT NULL,            -- cart total after discount
  applied_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(enabled, starts_at, ends_at);

-- The audit trail. Everything worth explaining lands here exactly once.
-- Append-only, guarded like mandates.
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  session_id  TEXT,
  type        TEXT NOT NULL,                   -- e.g. mandate.signed, policy.gate, payment.captured
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_mandates_session ON mandates(session_id);
