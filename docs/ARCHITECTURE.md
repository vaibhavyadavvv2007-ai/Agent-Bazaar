# The Agent Bazaar — Architecture

> A store that real AI agents shop at, where every rupee they move is **explainable, bounded and gated** — Razorpay AI Buildathon Track 01.

## The one-paragraph version

Any AI agent — Claude (or Groq) via a tool-use harness, or *any* MCP client via our own MCP endpoint — shops at an Indian street-bazaar catalog. Every purchase drives down the same road: a hash-linked, Ed25519-signed mandate chain (**INTENT → CART → PAYMENT**), through a pure-function policy engine with hard bounds, past a human-in-the-loop approval gate when a bound trips, onto real Razorpay **test-mode** rails (order → payment link → hosted settlement → signed webhook). Every step lands in an append-only event ledger you can export as JSONL. The bazaar floor renders this live: agents walk between stalls, mandate cards land as they're signed, the shopkeeper's bell rings when a human must decide.

## Traceability: Track-01 bar → implementation

| Track 01 requires | Where it lives |
|---|---|
| Money actions are **explainable** | Signed mandate chain: `lib/mandates/pipeline.ts` (chain), `lib/mandates/canonical.ts` (deterministic serialization), `lib/mandates/sign.ts` (Ed25519). Verify any chain live: `GET /api/mandates?verify=<intent>,<cart>,<payment>` |
| Spending is **bounded** | Pure policy engine `lib/policy/engine.ts` (+ tests): daily cap, single-txn limit, velocity window, category denies. Rules in `policy_rules`; every evaluation recorded in `policy_decisions` |
| Actions are **gated** | Human-in-the-loop queue: gate verdicts park in `approvals`, ring the bell on `/approvals` + bazaar floor; `POST /api/approvals` opens or closes the gate |
| **Audit trail** | Append-only `events` table (`schema.sql` triggers forbid UPDATE/DELETE); exportable JSONL; per-purchase chain verification |
| **One failure handled gracefully** | Real failed payment (`failure@razorpay`) → structured `failed` status + reason → agent retries on the SAME signed cart → capture marks the original `recovered`. Also: stock-outs, intent-bound violations, expired mandates — all structured refusals, never crashes |
| Merchant transactable by AI buyers **end-to-end** | One implementation behind every front door: REST (`app/api/**`), MCP server (`app/api/mcp/route.ts`), Claude harness (`lib/agents/claude.ts`), Groq harness (`lib/agents/groq.ts`) |
| Growth evidence | Agent-facing suggestions measured end-to-end: presented → accepted → attach rate on `/api/metrics` |
| Test-mode APIs | `lib/razorpay/client.ts` refuses to boot without `rzp_test_` keys |

## Module map

```
app/
  page.tsx                  bazaar floor (live SSE visualization)
  dashboard/page.tsx        honest metrics
  approvals/page.tsx        the shopkeeper's bell
  api/
    catalog/                products + agent-readable feed (?format=agent)
    mandates/               session/intent/cart/payment creation + chain verify
    checkout/               THE money gate: policy → rails
    approvals/              GET queue · POST decision (gate open/close)
    status/                 ground-truth payment status (+ poll reconciler)
    stream/                 SSE feed of everything
    webhooks/razorpay/      HMAC-verified settlement truth
    agents/run/             bounded provider-agent sessions
    metrics/                computed-from-ledger KPIs, labeled synthetic
    mcp/                    OUR MCP server — any MCP client can shop
    suggestions/            upsell presentation + acceptance measurement
lib/
  db.ts                     libSQL client (local file ↔ Turso, same SQL)
  mandates/{canonical,sign,pipeline}.ts
  policy/engine.ts          PURE function; the most-tested code here
  razorpay/{client,rail}.ts order+link issuance, idempotent settlement
  events/bus.ts             persist-once, fan-out-everywhere
  tools/store.ts            StoreTools — ONE shopping surface for all agents
  agents/{harness,claude,groq}.ts
scripts/
  migrate.ts seed.ts        setup
  settle-core.ts settle.ts  Playwright settlement driver (test instruments)
  demo.ts                   THE video driver — six scenarios, one command
```

## The mandate chain

```
INTENT   signed by USER     "authorize up to ₹X, categories Y"      (15 min TTL)
   └─hash─┐
CART       signed by AGENT  "exactly these SKUs at these prices"    (10 min)
   └─hash─┐                 prices/stock frozen AT THIS INSTANT
PAYMENT      signed by MERCHANT  "I will fulfill at ₹total"         (10 min)
        └→ policy engine → allow | GATE (human) | DENY (named rules)
                 allow/gate-open ↓
           Razorpay order + payment link (test mode)
                 ↓ hosted settlement (human click or driver)
           signed webhook + poll reconciler → captured | failed → recovered
```

Why three signatures? It makes each link's accountability *structural*, not narrative: the user bounded it, the agent committed it, the merchant guaranteed it. Any dispute resolves by re-running `verifyChain`.

**Immutability:** mandate rows are never updated after insert — not even status. Downstream life lives in `payments`/`approvals`/`events`. Rewriting history would require deleting rows; SQLite triggers (`RAISE(ABORT)`) forbid exactly that.

## Why the rail goes through a hosted page

Verified against Razorpay's docs: there is **no headless payment-authorization API**, even in test mode. Money completes only on a Razorpay-hosted surface. We treat that as a feature, not a workaround: it is AP2's Cart Mandate made physical — the exact cart is confirmed on the processor's own surface before money moves. On camera a human clicks deliberately; in bulk runs a Playwright driver uses test instruments (`success@razorpay` / `failure@razorpay`). Webhooks are signature-verified but never trusted as sole truth — a poll reconciler asks the rail directly.

## Data model

See `schema.sql` (fully commented). Twelve tables; the load-bearing ones:

- `mandates` — append-only, canonical-JSON payloads, sha256 hashes, parent-hash links, Ed25519 sigs, actor keys in `actor_keys`
- `policy_rules` / `policy_decisions` — the bounds, and EVERY verdict with named rule hits
- `approvals` — the human queue with requested/decided timestamps (latency metrics come from here)
- `payments` — one row per rail attempt; retries increment `attempt`; failures become `recovered` when the same cart later captures
- `events` — the audit spine; JSONL export is a SELECT away

## Deployment shape

Vercel (Next.js App Router, Node runtime) + Turso (hosted libSQL). Local dev uses a file-backed SQLite with identical SQL — `npm run setup && npm run dev`. Webhooks need the public URL, so the app deploys on day one.
