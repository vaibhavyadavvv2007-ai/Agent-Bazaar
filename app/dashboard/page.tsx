"use client";

import { useEffect, useState } from "react";
import { MetricCard, PageHeader, SectionHeader, StatusStamp } from "../_components/gazette";

/**
 * Honest-numbers dashboard. Every figure is computed from the append-only
 * ledger by /api/metrics — nothing here is hand-set, and no comparison is
 * invented: where history is not persisted, the card shows what IS known
 * (value + count + interpretation) and leaves trend space for later.
 */
type Metrics = {
  label: string;
  sessions_by_provider: Record<string, number>;
  money: {
    captured_inr: number; captured_paise: number; attempts_total: number;
    captured_count: number; failed_count: number; recovered_count: number;
    recovery_rate: number | null;
  };
  policy: { allow: number; gate: number; deny: number; total_decisions: number; gate_rate: number | null };
  human_in_loop: { approvals_granted: number; approval_latency_seconds: { p50: number | null; p95: number | null } };
  growth: { suggestions_presented: number; suggestions_accepted: number; attach_rate: number | null };
  campaigns: { total_applied: number; total_discount_paise: number; total_discount_inr: number };
};

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;

/** Money always carries its paise: ₹1,174 or ₹15,944.80 — never ₹15,944.8. */
const inr = (v: number): string =>
  `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/** Latency in humane units — "17s", "3h 19m" — never "11973s". */
const span = (s: number | null): string => {
  if (s === null) return "—";
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function Dashboard() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/metrics")
        .then((r) => r.json())
        .then((d: Metrics) => alive && setM(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 min-h-screen">
      <PageHeader title="Merchant Dashboard" kicker="how the system is performing" />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusStamp state="info">synthetic traffic</StatusStamp>
        <p className="font-body text-[13px] text-(--ink-soft)">
          measured honestly from the ledger — no hand-set figures
        </p>
      </div>

      {!m ? (
        <p className="mt-8 font-clause text-xs text-(--ink-soft)">loading ledger…</p>
      ) : (
        <>
          {/* ── Money & payments ─────────────────────────────────── */}
          <section className="mt-6" aria-label="Money and payments">
            <SectionHeader title="Money & Payments" kicker="what moved, what survived" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Money moved"
                value={inr(m.money.captured_inr)}
                count={`${m.money.captured_count} transactions captured`}
                note={`recovered included: ${m.money.recovered_count}`}
              />
              <MetricCard
                label="Recovery rate"
                value={pct(m.money.recovery_rate)}
                count={`${m.money.recovered_count} of ${m.money.failed_count} failures recovered`}
                state={m.money.recovery_rate !== null && m.money.recovery_rate >= 0.5 ? "ok" : "warn"}
                note="failures are engineered, then recovered"
              />
              <MetricCard
                label="Failed payments"
                value={String(m.money.failed_count)}
                count={`${m.money.attempts_total} total attempts`}
                state={m.money.failed_count > m.money.recovered_count ? "bad" : "warn"}
                note={m.money.failed_count > m.money.recovered_count ? "unrecovered failures remain" : "all failures recovered"}
              />
              <MetricCard
                label="Sessions"
                value={String(Object.values(m.sessions_by_provider).reduce((a, b) => a + b, 0))}
                count={Object.entries(m.sessions_by_provider).map(([k, v]) => `${k}:${v}`).join(" · ") || "none yet"}
                note="agents dispatched, by provider"
              />
            </div>
          </section>

          {/* ── Governance ───────────────────────────────────────── */}
          <section className="mt-6" aria-label="Governance">
            <SectionHeader title="Governance" kicker="policy, gates and the human hand" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Gate rate"
                value={pct(m.policy.gate_rate)}
                count={`${m.policy.gate} of ${m.policy.total_decisions} decisions went to a human`}
                state="warn"
                href="/approvals"
                linkLabel="decision queue →"
              />
              <MetricCard
                label="Policy verdicts"
                value={`${m.policy.allow}/${m.policy.gate}/${m.policy.deny}`}
                count="allow / gate / deny"
                note="every decision recorded with its rule hits"
                href="/receipts"
                linkLabel="audit trail →"
              />
              <MetricCard
                label="Approvals granted"
                value={String(m.human_in_loop.approvals_granted)}
                count="human decisions made"
                note="each approval is on the record"
                href="/approvals"
                linkLabel="queue →"
              />
              <MetricCard
                label="Approval latency"
                value={span(m.human_in_loop.approval_latency_seconds.p50)}
                count={`p95 ${span(m.human_in_loop.approval_latency_seconds.p95)} · ${m.human_in_loop.approvals_granted} approvals`}
                note="bell-ring to decision click"
              />
            </div>
          </section>

          {/* ── Growth & campaigns ───────────────────────────────── */}
          <section className="mt-6" aria-label="Growth and campaigns">
            <SectionHeader title="Growth & Campaigns" kicker="offers and their pull" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Campaigns applied"
                value={String(m.campaigns.total_applied)}
                count={m.campaigns.total_discount_inr > 0 ? `${inr(m.campaigns.total_discount_inr)} discount given` : "no discounts yet"}
                state="ok"
                href="/campaigns"
                linkLabel="campaign manager →"
              />
              <MetricCard
                label="Upsell attach"
                value={pct(m.growth.attach_rate)}
                count={`${m.growth.suggestions_accepted}/${m.growth.suggestions_presented} suggestions accepted`}
                note="agents taking the merchant's advice"
              />
            </div>
          </section>

          <section className="mt-8 border-[1.5px] border-(--ink) bg-(--paper-deep) p-4">
            <p className="font-body text-[13px] leading-snug text-(--ink-soft)">
              <b className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink)">Reading this page:</b>{" "}
              every transaction above walked a signed mandate chain and the policy gate before touching
              real test-mode rails. Failures are shown because they were engineered to happen, then
              recovered. Full trail:{" "}
              <a href="/api/metrics" className="underline decoration-(--rule-blue) underline-offset-2 hover:text-(--rule-blue)">/api/metrics</a>.
            </p>
          </section>

          <footer className="mt-6 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
            <p className="fig">
              <span className="pointer" aria-hidden="true" />
              Fig. 8: every metric above is computed from the append-only ledger, not hand-set.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
