# Threat model — who tries what, what stops them

The question agentic commerce must answer: *when an AI agent spends money, who do you blame and how do you prove it?* This table maps each attack to its control. Every control names the file that implements it.

| # | Attack | Stopped by | Implementation |
|---|---|---|---|
| 1 | Prompt-injected agent overspends ("buy everything") | Daily cap + single-txn limit force gate/deny before any rail call | `lib/policy/engine.ts` · `lib/mandates/pipeline.ts` `requestCheckout()` |
| 2 | Agent moves money without user authorization | Money path REQUIRES a hash-linked chain rooted in a user-signed INTENT whose bounds bind carts | `createCartMandate()` bound checks · `verifyChain()` |
| 3 | Cart swapped after user consent (price/item drift) | CART freezes prices+stock at signing; checkout re-verifies full chain incl. expiry | `pipeline.ts` validation-at-instant · `requestCheckout()` chain check |
| 4 | Replayed/stale mandate reused later | Per-mandate TTLs (15/10 min) checked at creation AND at checkout | `TTL` in `pipeline.ts`, `assertFresh()`, `not_expired` check |
| 5 | Forged mandate (agent signs as user/merchant) | Three distinct Ed25519 keys; each link verified under its actor's key; sigs over canonical JSON only | `lib/mandates/sign.ts` · `canonical.ts` |
| 6 | Ledger tampering ("edit history to hide the spend") | Append-only triggers RAISE(ABORT) on UPDATE/DELETE for mandates+events | `schema.sql` triggers |
| 7 | Rogue webhook injects fake "captured" | HMAC-SHA256 over raw body vs `x-razorpay-signature`, timing-safe compare; unsigned → loud 500, ledger untouched | `app/api/webhooks/razorpay/route.ts` |
| 8 | Duplicate/replayed webhook double-counts | Idempotent settlement: terminal states short-circuit; duplicate recorded as its own event | `rail.ts` `applySettlement()` |
| 9 | Webhook silently lost (payment actually captured) | Poll reconciler is source of truth; status endpoint asks the rail directly | `rail.ts` `reconcileByReference()` |
| 10 | Runaway agent loops on camera / burns budget | Harness hard-caps turns (12); provider temperature 0; transcripts recorded | `lib/agents/harness.ts` `MAX_TURNS` |
| 11 | Agent sneaks denied category via re-wording | Deny matches structured category data from catalog, not agent's prose | `policy/engine.ts` category_deny |
| 12 | Human approval queue ignored; agent self-approves | Approvals decided ONLY via POST /api/approvals; agent tool surface has no such verb | `tools/store.ts` (no approve tool) vs `approvals/route.ts` |
| 13 | Live keys leak into a demo repo | Boot-time refusal unless `rzp_test_`; `.env*` gitignored; `.env.example` only | `client.ts` · `.gitignore` |

Residual risks accepted for demo scope: server-held user key (see LIMITATIONS), single-instance SSE, seed-managed rules. Each has a named production answer (per-device keys, Redis fanout, merchant policy UI) — happy to walk through any of them.
