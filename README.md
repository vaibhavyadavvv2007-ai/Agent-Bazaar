# The Agent Bazaar 🪔

**A store that real AI agents shop at — where every rupee they move is explainable, bounded and gated.**

Razorpay AI Buildathon · Track 01 · AI Growth & Agentic Commerce

Claude, Gemini, or *any MCP client* walks into an Indian street bazaar and buys — through real
Razorpay **test-mode** rails. Every purchase drives the same road: a hash-linked Ed25519-signed
mandate chain (INTENT → CART → PAYMENT), a pure-function policy engine with hard bounds, and a
human-in-the-loop approval gate when a bound trips. All of it lands in an append-only audit ledger,
rendered live on a bazaar floor you can watch.

> **Test mode only.** The client refuses to boot without `rzp_test_` keys. No real money moves anywhere.

## Quickstart

```bash
npm install
cp .env.example .env.local   # paste rzp_test_ keys + webhook secret (or leave empty for keyless dev)
npm run setup                # migrate + seed 13 stalls & policy rules
npm run dev                  # http://localhost:3000
```

Then watch it work:

```bash
npx tsx scripts/smoke.ts                 # keyless: signed chain, deny, gate, approvals
npx tsx scripts/demo.ts                  # full story incl. real payments (needs keys)
```

## What to look at

| Surface | URL |
|---|---|
| Bazaar floor (live) | `/` |
| Honest metrics dashboard | `/dashboard` |
| Shopkeeper's approval queue | `/approvals` |
| Agent-readable catalog | `/api/catalog?format=agent` |
| MCP endpoint (point any MCP client here) | `/api/mcp` |
| Chain verification | `/api/mandates?verify=<intent>,<cart>,<payment>` |

## Docs

- [Architecture](docs/ARCHITECTURE.md) — with a Track-01-bar → implementation traceability table
- [Threat model](docs/THREAT-MODEL.md) — 13 attacks, 13 named controls
- [Limitations](docs/LIMITATIONS.md) — stated plainly
- [ADRs](docs/adr/) — SDK-over-MCP for the rail · append-only ledger · stdlib Ed25519

## Status

Under active construction toward the Sept 5 deadline.
