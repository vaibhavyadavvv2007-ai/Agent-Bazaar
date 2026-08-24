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
        setNote("Gate opened — hosted payment page launched in a new tab.");
      } else if (decision === "rejected") {
        setNote("Gate kept shut — the agent will receive a structured refusal.");
      }
    } finally {
      setBusy(null);
      load();
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">🔔 Shopkeeper&apos;s queue</h1>
        <a href="/" className="text-sm underline decoration-(--bazaar-line) underline-offset-4">← bazaar floor</a>
      </header>

      {note && (
        <p className="mb-4 rounded-lg border border-(--bazaar-blue)/40 bg-blue-950/30 px-3 py-2 text-sm text-blue-200">{note}</p>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-(--bazaar-line) p-10 text-center text-(--bazaar-ink-dim)">
          No bells ringing. The bazaar is calm — agents are inside their bounds.
          <div className="mt-3 text-xs">A gated transaction parks here with its named rule hits.</div>
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.map((q) => (
            <li key={q.id} className="rounded-xl border border-(--bazaar-marigold)/60 bg-(--bazaar-panel) p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-(--bazaar-marigold)">{rupees(q.amount_paise)}</span>
                <span className="text-xs text-(--bazaar-ink-dim)">rang at {q.requested_at}</span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-(--bazaar-ink-dim)">
                {(Array.isArray(q.reasons) ? q.reasons : [{ detail: String(q.reasons) }]).map((r, i) => (
                  <li key={i}>• {r.detail}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => decide(q.id, "approved")}
                  disabled={busy === q.id}
                  className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  Approve &amp; open gate
                </button>
                <button
                  onClick={() => decide(q.id, "rejected")}
                  disabled={busy === q.id}
                  className="rounded-lg border border-red-800 px-4 py-1.5 text-sm font-medium text-red-300 hover:bg-red-950 disabled:opacity-50"
                >
                  Refuse
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
