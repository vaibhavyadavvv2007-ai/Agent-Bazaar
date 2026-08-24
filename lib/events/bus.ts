import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * The event spine. Everything worth explaining flows through here exactly
 * once: persisted immutably to `events`, fanned out live to SSE subscribers
 * (bazaar floor, dashboard).
 *
 * The EventEmitter lives on globalThis so Next.js dev-mode HMR doesn't spawn
 * duplicate buses. On serverless each instance has its own bus — SSE fanout
 * is single-instance by design; the dashboard polls /api/metrics as its own
 * fallback (see docs/LIMITATIONS.md).
 */
export type BazaarEvent = {
  id?: string;
  ts?: string;
  type: string;
  session_id?: string | null;
  payload?: Record<string, unknown>;
};

const g = globalThis as unknown as { __bazaarBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__bazaarBus) {
    g.__bazaarBus = new EventEmitter();
    g.__bazaarBus.setMaxListeners(100);
  }
  return g.__bazaarBus;
}

/** Persist immutably, then broadcast. Returns the stored event. */
export async function publish(event: BazaarEvent): Promise<BazaarEvent> {
  const stored: BazaarEvent = {
    id: event.id ?? randomUUID(),
    ts: new Date().toISOString(),
    type: event.type,
    session_id: event.session_id ?? null,
    payload: event.payload ?? {},
  };
  await db().execute({
    sql: "INSERT INTO events (id, ts, session_id, type, payload_json) VALUES (?, ?, ?, ?, ?)",
    args: [stored.id!, stored.ts!, stored.session_id ?? null, stored.type, JSON.stringify(stored.payload)],
  });
  bus().emit("event", stored);
  return stored;
}

/** Subscribe to the live feed. Returns an unsubscribe function. */
export function subscribe(listener: (e: BazaarEvent) => void): () => void {
  const b = bus();
  b.on("event", listener);
  return () => b.off("event", listener);
}
