"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The shopkeeper's bell. When the policy engine gates a transaction, a human
 * decides here. Approval latency (measured on the dashboard) starts when the
 * bell rings and stops when this button is clicked.
 */
type QueueItem = {
  id: string;
  mandate_id: string;
  session_id: string;
  amount_paise: number;
  cart_mandate_id: string | null;
  reasons: { rule_id?: string; kind?: string; detail?: string }[] | string;
  requested_at: string;
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function Approvals() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((d: { queue: QueueItem[] }) => setQueue(d.queue ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  async function decide(approvalId: string, decision: "approved" | "rejected") {
    setBusy(approvalId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approval_id: approvalId, decision, decided_by: "shopkeeper-ui" }),
      });
      const json = (await res.json()) as { rail?: { checkout_url?: string }; note?: string };
      if (decision === "approved" && json.rail?.checkout_url) {
        window.open(json.rail.checkout_url, "_blank", "noopener");
        setNote("Gate opened; the hosted payment page launched in a new tab.");
      } else if (decision === "rejected") {
        setNote("Gate kept shut; the agent will receive a structured refusal.");
      }
    } finally {
      setBusy(null);
      load();
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 min-h-screen">
      <header className="mb-8 flex items-center justify-between border-b-2 border-double border-(--bazaar-ink) pb-4">
        <h1 className="font-masthead text-2xl font-bold tracking-tight uppercase">Shopkeeper&apos;s Queue</h1>
        <a href="/" className="font-clause text-sm underline decoration-(--bazaar-line) underline-offset-4 hover:text-(--bazaar-marigold)">← return to floor</a>
      </header>

      {note && (
        <div className="mb-4 typeset-in">
          <p className="seal seal-green">notice</p>
          <p className="mt-1.5 font-clause text-sm text-(--bazaar-ink)">{note}</p>
        </div>
      )}

      {queue.length === 0 ? (
        <div className="border-[1.5px] border-dashed border-(--bazaar-ink) bg-(--bazaar-panel) p-10 text-center font-clause text-(--bazaar-ink-dim)">
          No bells ringing. The bazaar is calm; agents are inside their bounds.
          <div className="mt-3 text-xs">A gated transaction parks here with its named rule hits.</div>
        </div>
      ) : (
        <>
        <div className="security-thread-band" aria-hidden="true" />
        <ul className="space-y-3">
          {queue.map((q) => (
            <li key={q.id} className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--bazaar-line) pb-2">
                <span className="font-masthead text-lg font-bold text-(--bazaar-ink)">{rupees(q.amount_paise)}</span>
                <span className="font-clause text-xs text-(--bazaar-ink-dim)">rang at {q.requested_at}</span>
              </div>
              <ul className="mt-3 space-y-1 font-clause text-sm text-(--bazaar-ink)">
                {(Array.isArray(q.reasons) ? q.reasons : [{ detail: String(q.reasons) }]).map((r, i) => (
                  <li key={i}>• {r.detail}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-3 border-t border-(--bazaar-line) pt-4">
                <button
                  onClick={() => decide(q.id, "approved")}
                  disabled={busy === q.id}
                  className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-ink) px-4 py-1.5 font-clause text-sm font-bold uppercase tracking-wider text-(--paper) hover:bg-(--bazaar-ink-dim) disabled:opacity-50"
                >
                  Approve &amp; open gate
                </button>
                <button
                  onClick={() => decide(q.id, "rejected")}
                  disabled={busy === q.id}
                  className="border-[1.5px] border-(--bazaar-ink) bg-transparent px-4 py-1.5 font-clause text-sm font-bold uppercase tracking-wider text-(--bazaar-ink) hover:bg-(--bazaar-ink) hover:text-(--paper) disabled:opacity-50"
                >
                  Refuse
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="security-thread-band mt-3" aria-hidden="true" />
        </>
      )}

      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--bazaar-ink-dim)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Approval latency is measured from bell-ring to this page click.
        </p>
      </footer>
    </main>
  );
}
