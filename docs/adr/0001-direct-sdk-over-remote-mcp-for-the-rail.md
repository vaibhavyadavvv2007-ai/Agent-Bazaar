# ADR 0001 — Direct Razorpay SDK for the money rail; MCP as a surface, not a rail

**Status:** accepted · **Date:** 2026-08

## Context
Razorpay ships an official remote MCP server (`mcp.razorpay.com/mcp`, 35+ tools). We also expose our own MCP server so any MCP client can shop. Question: should agent-driven payments route through Razorpay's remote MCP, or through the official Node SDK called from one pipeline?

## Decision
Direct SDK (`razorpay` npm) inside `lib/razorpay/`, invoked only by the mandate pipeline. Razorpay's remote MCP gets a cameo (verifying interoperability), never load-bearing.

## Reasons
1. **Determinism under demo.** One code path executes money movement regardless of which front door triggered it. A third transport on camera is a third failure mode.
2. **Prompt economy.** 35 tools of context degrade small-model tool-choice; agents need exactly six store verbs.
3. **Fit.** The remote payment-initiation tool presumes vaulted instruments + OTP flows — not a fresh test-mode storefront.
4. **The "any MCP client" claim doesn't need their server.** Our `/api/mcp` delivers it, self-owned.

## Consequences
+ Reproducible demos, single audited money path.
− One more integration to keep current with API changes (acceptable: thin wrapper).
