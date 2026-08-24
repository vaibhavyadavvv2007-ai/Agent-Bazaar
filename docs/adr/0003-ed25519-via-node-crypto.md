# ADR 0003 — Ed25519 signatures from Node's built-in crypto; canonical JSON for signing

**Status:** accepted · **Date:** 2026-08

## Context
Mandates need real signatures. Options: JWT/JWS (SD-JWT is where AP2 is heading), a crypto library, or Node stdlib.

## Decision
Ed25519 via `node:crypto` (`crypto.sign(null, …)` — Ed25519 takes no digest). Payloads are signed as **canonical JSON** (recursively key-sorted serialization), hashed with sha256 for chain linkage.

## Reasons
1. Zero dependencies for the most security-sensitive code in the repo.
2. Deterministic serialization makes signatures portable across actors/languages — the property AP2's SD-JWT work formalizes later.
3. Upgrade path is clean: swap payload encoding for SD-JWT without touching chain logic.

## Consequences
+ Auditable, dependency-free, fast.
− Not yet SD-JWT/verifiable-credentials compatible (documented in LIMITATIONS; roadmap item).
