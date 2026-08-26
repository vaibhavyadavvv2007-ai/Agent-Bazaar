"use client";

import { useEffect, useState } from "react";

/**
 * Live tap into the bazaar's event spine. Everything on screen arrives here
 * first — the floor never writes state, it only watches truth happen.
 */
export type LiveEvent = {
  id?: string;
  ts?: string;
  type: string;
  session_id?: string | null;
  payload?: Record<string, unknown>;
};

export function useBazaarStream(): { connected: boolean; last: LiveEvent[] } {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<LiveEvent[]>([]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as LiveEvent;
        setLast((prev) => [e, ...prev].slice(0, 160));
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, []);

  return { connected, last };
}

/** Stable per-session hue for agent dots (fixed assignment, never cycled). */
export const DOT_HUES = ["var(--seal)", "var(--rule-blue)", "var(--henna)", "var(--thread)"];

export function hueFor(sessionId: string): string {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  return DOT_HUES[h % DOT_HUES.length];
}
