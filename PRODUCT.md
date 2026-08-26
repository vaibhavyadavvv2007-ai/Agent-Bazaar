# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Razorpay engineers and hiring evaluators (the AI Builder Internship panel) — they watch a 5-minute pitch video, then click a public URL skeptically, giving each submission seconds to prove it is real and well-built. Secondary: the builder themself, playing the shopkeeper live during the recorded demo and in panel interviews.

## Product Purpose

The Agent Bazaar is a working agentic-commerce store where real AI agents (Claude, Gemini, any MCP client) shop with real Razorpay test-mode money. It exists to prove one thing: agent spending can be explainable (signed mandate chain), bounded (a pure-function policy engine), gated (human approval on risky carts), and fully audited (an append-only ledger) — today, not in a whitepaper. Success = a shortlist panel interview and an internship offer.

## Positioning

The only store where you watch AI agents spend real (test-mode) money through a live governance loop — signed permission slips, hard spending walls, a ringing human bell — with a receipt for every rupee. A chatbot-checkout clone cannot copy this: the mandates, gates, ledger, and live agent sessions are real infrastructure, not narrative.

## Operating Context

Evaluated asynchronously (repo + video + live URL) for a hiring program closing Sept 5, 2026. Demo runs are driven by `scripts/demo.ts` and `POST /api/agents/run`; traffic is synthetic and labeled as such. Test-mode only (`rzp_test_` keys; code refuses live keys). Indian context throughout: INR amounts, Razorpay rails, Indian street-market flavor in product naming.

## Capabilities and Constraints

- Live SSE event stream feeds the visualization; the visualization is a read-only viewer over the real pipeline.
- Human settlement on Razorpay's hosted checkout is a designed feature (device-integrity systems block automated settlement) — the "Cart Mandate moment".
- Deployed on Vercel + Turso; local dev uses file SQLite with identical SQL.
- Next.js 15 App Router, TypeScript strict, Tailwind v4, React 19.
- No real money anywhere; failures are engineered and labeled.

## Brand Commitments

Name "The Agent Bazaar" is current but NOT binding — the user granted full visual freedom including the name. Track 01 of the Razorpay AI Buildathon is the arena. The user's bar: "fintech-flagship polish" — Stripe/Razorpay-caliber craft, zero AI-slop tells.

## Evidence on Hand

Live-proven: ₹1,248 captured, failed→recovered arc with real bank-decline reasons, autonomous Claude Haiku purchase (7 turns), MCP endpoint verified, policy gates firing live. Screenshots in `shots/` (floor with agent walking stalls, receipt bill book). All order IDs real (`order_TU…`). No testimonials, no customer logos, no fabricated benchmarks — none may be invented.

## Product Principles

1. Truth over theater — every pixel is driven by the real pipeline; if the viz dies, the dashboard still tells the truth.
2. Measured honesty — synthetic traffic labeled, failures shown proudly, every claim backed by a ledger row.
3. Watchable infrastructure — invisible money-movement made visible; the demo is the product.
4. Judge's 10 seconds — the first viewport must prove "real rails, real agents, real governance" without scrolling.

## Accessibility & Inclusion

Keyboard-visible focus required; reduced-motion respected; status never color-alone (icon + label). Dark night-market ground is the product's home; contrast must hold.
