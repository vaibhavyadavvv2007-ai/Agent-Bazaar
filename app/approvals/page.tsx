"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, SectionHeader, StatusStamp } from "../_components/gazette";

/**
 * The shopkeeper's bell — a WORK QUEUE, not a landing page.
 *
 * Top strip answers "what requires human action?"; each item answers
 * "how much, why, and what can I do about it". Green is reserved for
 * settled success: awaiting-payment is amber, refusal is destructive
 * and asks twice.
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

type OpenCheckout = {
  payment_row_id: string;
  amount_paise: number;
  created_at: string;
  checkout_url: string;
};

type DecidedToday = { approved: number; rejected: number };

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function summaryTime(utc: string): string {
  try {
    return new Date(utc + "Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return utc;
  }
}

export default function Approvals() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [openCheckouts, setOpenCheckouts] = useState<OpenCheckout[]>([]);
  const [decidedToday, setDecidedToday] = useState<DecidedToday>({ approved: 0, rejected: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/approvals?t=${Date.now()}`)
      .then((r) => r.json())
      .then((d: { queue: QueueItem[]; open_checkouts?: OpenCheckout[]; decided_today?: DecidedToday }) => {
        setQueue(d.queue ?? []);
        setOpenCheckouts(d.open_checkouts ?? []);
        setDecidedToday(d.decided_today ?? { approved: 0, rejected: 0 });
      })
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
        // The open-checkouts list below (polled from the server) carries the
        // durable button — this auto-open is best-effort because window.open
        // after an await has lost user-gesture status (popup blockers).
        window.open(json.rail.checkout_url, "_blank", "noopener");
        setNote("Gate opened; checkout is open in a new tab (or use the button below).");
      } else if (decision === "approved") {
        setNote("Gate opened, but rail issuance failed — check the server logs.");
      } else if (decision === "rejected") {
        setNote("Gate kept shut; the agent will receive a structured refusal.");
      }
    } finally {
      setBusy(null);
      load();
    }
  }

  const queueClear = queue.length === 0 && openCheckouts.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 min-h-screen">
      <PageHeader title="Shopkeeper's Queue" kicker="what requires human action" />

      {/* ── Queue summary strip ─────────────────────────────────── */}
      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Queue summary">
        <div className="border-[1.5px] border-(--warn) bg-(--warn-bg) p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--warn-ink)">Needs action</span>
            <StatusStamp state={queue.length > 0 ? "warn" : "ok"}>{queue.length > 0 ? "review" : "clear"}</StatusStamp>
          </div>
          <div className="digits mt-1 text-2xl text-(--ink)">{queue.length}</div>
          <p className="fig mt-0.5"><span className="pointer" aria-hidden="true" />gated carts awaiting a decision</p>
        </div>
        <div className="border-[1.5px] border-(--ink) bg-(--paper-deep) p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Awaiting payment</span>
            <StatusStamp state={openCheckouts.length > 0 ? "warn" : "neutral"}>{openCheckouts.length > 0 ? "pending" : "none"}</StatusStamp>
          </div>
          <div className="digits mt-1 text-2xl text-(--ink)">{openCheckouts.length}</div>
          <p className="fig mt-0.5"><span className="pointer" aria-hidden="true" />rails issued, not yet paid</p>
        </div>
        <div className="border-[1.5px] border-(--ink) bg-(--paper-deep) p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Decided today</span>
            <StatusStamp state={decidedToday.approved + decidedToday.rejected > 0 ? "ok" : "neutral"}>done</StatusStamp>
          </div>
          <div className="digits mt-1 text-2xl text-(--ink)">{decidedToday.approved + decidedToday.rejected}</div>
          <p className="fig mt-0.5"><span className="pointer" aria-hidden="true" />{decidedToday.approved} approved · {decidedToday.rejected} refused</p>
        </div>
      </section>

      {note && (
        <div className="typeset-in mt-4 border-[1.5px] border-(--ink) bg-(--paper-deep) p-3">
          <StatusStamp state="info">notice</StatusStamp>
          <p className="mt-1.5 font-body text-[13px] text-(--ink)">{note}</p>
        </div>
      )}

      {/* ── Awaiting payment ────────────────────────────────────── */}
      {openCheckouts.length > 0 && (
        <section className="mt-6" aria-label="Awaiting payment">
          <SectionHeader title="Rails Issued · Awaiting Payment" kicker="approved, unpaid" />
          <ul className="mt-3 space-y-3">
            {openCheckouts.map((oc) => (
              <li key={oc.payment_row_id} className="flex flex-wrap items-center justify-between gap-3 border-[1.5px] border-(--ink) bg-(--paper-deep) p-4">
                <div>
                  <div className="digits font-masthead text-lg text-(--ink)">{rupees(oc.amount_paise)}</div>
                  <p className="fig mt-0.5"><span className="pointer" aria-hidden="true" />issued {summaryTime(oc.created_at)} · row {oc.payment_row_id.slice(0, 12)}…</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/receipts/${oc.payment_row_id}`}
                    className="press border-[1.5px] border-(--ink) bg-transparent px-3 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--ink) hover:bg-(--ink) hover:text-(--paper)"
                  >
                    View order
                  </Link>
                  <a
                    href={oc.checkout_url}
                    target="_blank"
                    rel="noopener"
                    className="press border-[1.5px] border-(--ink) bg-(--ink) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--ink-soft)"
                  >
                    Open checkout →
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The queue itself ────────────────────────────────────── */}
      <section className="mt-6" aria-label="Approvals requiring decision">
        <SectionHeader title="Summonses" kicker={`${queue.length} awaiting your decision`} />
        <div className="security-thread-band mt-2" aria-hidden="true" />

        {queue.length === 0 ? (
          <div className="mt-3 border-[1.5px] border-dashed border-(--ink-soft) bg-(--paper-deep) p-8 text-center">
            <div className="flex items-center justify-center gap-2">
              <StatusStamp state="ok">queue clear</StatusStamp>
            </div>
            <p className="mt-3 font-body text-[13px] font-semibold text-(--ink)">
              No approvals require your attention.
            </p>
            <p className="mt-1 font-body text-[13px] italic text-(--ink-soft)">
              No bells ringing. The bazaar is calm; agents are inside their bounds.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {queue.map((q) => (
              <li key={q.id} className="border-[1.5px] border-l-[3px] border-l-(--warn) border-(--ink) bg-(--paper-deep) p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <StatusStamp state="warn">human review required</StatusStamp>
                  <span className="fig">rang {summaryTime(q.requested_at)}</span>
                </div>

                <div className="digits mt-2 text-2xl text-(--ink)">{rupees(q.amount_paise)}</div>

                <ul className="mt-2 space-y-1">
                  {(Array.isArray(q.reasons) ? q.reasons : [{ detail: String(q.reasons) }]).map((r, i) => (
                    <li key={i} className="font-body text-[13px] text-(--ink-soft)">
                      <span className="fig" aria-hidden="true">▸ </span>
                      {r.detail}
                      {r.kind && <span className="fig ml-1">[{r.kind}]</span>}
                    </li>
                  ))}
                </ul>

                <p className="fig mt-2">
                  <span className="pointer" aria-hidden="true" />
                  session {q.session_id.slice(0, 18)}… · mandate {q.mandate_id.slice(0, 12)}…
                </p>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-(--paper-edge) pt-3">
                  <Link
                    href={`/receipts/${q.mandate_id}`}
                    className="press border-[1.5px] border-(--ink) bg-transparent px-3 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--ink) hover:bg-(--ink) hover:text-(--paper)"
                  >
                    View order
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Refuse this transaction? The agent receives a structured refusal and the cart is not paid.")) {
                        decide(q.id, "rejected");
                      }
                    }}
                    disabled={busy === q.id}
                    className="press border-[1.5px] border-(--bad) bg-transparent px-3 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--bad-ink) hover:bg-(--bad-bg) disabled:opacity-50"
                  >
                    Refuse
                  </button>
                  <button
                    onClick={() => decide(q.id, "approved")}
                    disabled={busy === q.id}
                    className="press ml-auto border-[1.5px] border-(--ink) bg-(--ink) px-4 py-1.5 font-clause text-xs font-bold uppercase tracking-wider text-(--paper) hover:bg-(--ink-soft) disabled:opacity-50"
                  >
                    {busy === q.id ? "Deciding…" : "Approve & open gate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Approval latency is measured from bell-ring to this page click.
        </p>
      </footer>
    </main>
  );
}
