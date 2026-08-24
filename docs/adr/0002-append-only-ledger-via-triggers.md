# ADR 0002 — Append-only ledger enforced by SQLite triggers; no status updates on mandates

**Status:** accepted · **Date:** 2026-08

## Context
An audit trail you can edit is a diary, not an audit trail. Tempting design: update `mandates.status` through a lifecycle (pending → signed → fulfilled…). That makes every transition a mutation.

## Decision
Mandate rows are immutable after insert — status included. Lifecycle lives in sibling tables (`payments`, `approvals`, `policy_decisions`) and the `events` spine. SQLite triggers (`RAISE(ABORT)` on UPDATE/DELETE) enforce immutability at the storage layer.

## Reasons
1. Tampering requires deleting rows — precisely what's forbidden.
2. State reconstruction is trivially correct: read events forward.
3. No ORM needed; plain SQL stays judge-readable.

## Consequences
+ Trustworthy-by-construction history; simple mental model.
− Slightly more joins to assemble "current state" (fine at this scale).
