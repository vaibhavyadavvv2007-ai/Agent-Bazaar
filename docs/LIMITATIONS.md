# Limitations — stated plainly

Judges should know exactly where the edges are. Nothing here is hidden.

## Test-mode only
Every key in this repo is `rzp_test_`. The client refuses to boot otherwise (`lib/razorpay/client.ts`). No real money moves anywhere.

## Payment completion requires Razorpay's hosted page
Razorpay exposes no headless payment-authorization API, even in test mode (verified against their docs). Our rail issues orders + payment links via API; settlement happens on Razorpay's own hosted page, completed either by a deliberate human click or by a Playwright driver using test instruments. In production this maps to AP2's human-presence cart confirmation — but here it is also simply a constraint of the rails.

## The "user" signature is simulated
The INTENT mandate is signed by a server-side Ed25519 key labeled `user`. A real deployment would hold that key on the buyer's device/trusted surface and never ship it to the server. We simulate consent rather than fake cryptography — the chain verifies for real; the *ceremony* around the user's key is theater, and we say so.

## Traffic is synthetic
All sessions on the deployed demo are driven by `scripts/demo.ts` (or hand-run equivalents). The dashboard labels this on every screen. Metrics are computed from the ledger, never hand-set — but they measure a simulation of agentic traffic, not organic adoption.

## Single instance assumptions
- The SSE bus fans out per server instance; multi-region/multi-instance fanout would need Redis/Postgres LISTEN-NOTIFY. Fine at demo scale, noted honestly.
- Actor keys live in the DB (demo-grade). Production: HSM/KMS-backed keys, per-user key material.
- Policy rules are global/per-agent rows managed by seed script; there is no merchant UI for editing them yet.

## What is deliberately NOT here (scope honesty)
- Refunds, subscriptions, Route/settlements to vendors — cut to keep one loop excellent.
- No fraud ML — Track 01 is not Track 02; the policy engine is deterministic rules with named reasons, which is what explainability actually demands at this scale.
- Suggestions are rule-based (complementary categories), not learned. The *measurement* of acceptance is real; the recommender is intentionally simple.
- No i18n beyond English/Hinglish product copy; no mobile layout polish.

## Known rough edges
- Playwright settlement driver depends on Razorpay's hosted-page DOM (selectors can drift; screenshots land in `shots/` when it misses).
- Mandate TTLs (15/10 min) are generous for demos; production would tighten and add renewal ceremony.
