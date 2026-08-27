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
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let retryCount = 0;
    let active = true;

    function connect() {
      if (!active) return;
      es = new EventSource("/api/stream");
      es.onopen = () => {
        setConnected(true);
        retryCount = 0;
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (active) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as LiveEvent;
          setLast((prev) => [e, ...prev].slice(0, 160));
        } catch {
          // ignore malformed frames
        }
      };
    }

    connect();

    // Polling fallback for Vercel serverless multi-instance
    let maxTs = new Date().toISOString();
    const pollTimer = setInterval(async () => {
      if (!active) return;
      try {
        const r = await fetch("/api/events?limit=40");
        const d = await r.json();
        if (d.events && Array.isArray(d.events)) {
          setLast((prev) => {
            const seen = new Set(prev.map((e) => e.id ?? `${e.type}:${e.ts}`));
            const newEvents = d.events.filter((e: LiveEvent) => {
              const id = e.id ?? `${e.type}:${e.ts}`;
              if (seen.has(id)) return false;
              if (e.ts && e.ts < maxTs) return false; // Only accept new live events
              seen.add(id);
              return true;
            });
            if (newEvents.length === 0) return prev;
            
            // Update maxTs so we don't process them again
            for (const e of newEvents) {
              if (e.ts && e.ts > maxTs) maxTs = e.ts;
            }
            
            // API returns oldest-first. We want newest-first in `last`.
            return [...newEvents.reverse(), ...prev].slice(0, 160);
          });
        }
      } catch {}
    }, 2000);

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      if (es) es.close();
    };
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
