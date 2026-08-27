"use client";

import { useEffect, useState } from "react";

/**
 * Honest-numbers dashboard. Every figure is computed from the append-only
 * ledger by /api/metrics — nothing here is hand-set. The synthetic-traffic
 * label is the most important element on the page and stays on top.
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
};

function Tile(props: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const toneIcon = props.tone === "good" ? "✅" : props.tone === "warn" ? "🔔" : props.tone === "bad" ? "⚠️" : "•";
  return (
    <div className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-4">
      <div className="text-xs uppercase tracking-wider text-(--bazaar-ink-dim)">
        {props.label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{props.value}</div>
      {props.sub && (
        <div className="mt-1 font-clause text-xs text-(--bazaar-ink-dim)">
          {props.tone && <span className={`mr-1 seal ${props.tone === "good" ? "seal-green" : props.tone === "warn" ? "seal-gold" : "seal-red"}`}>{toneIcon}</span>}
          {props.sub}
        </div>
      )}
    </div>
  );
}

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;

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
    <main className="mx-auto max-w-5xl px-6 py-10 min-h-screen">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b-2 border-double border-(--bazaar-ink) pb-4">
        <h1 className="font-masthead text-2xl font-bold tracking-tight uppercase">Merchant Dashboard</h1>
        <a href="/" className="font-clause text-sm underline decoration-(--bazaar-line) underline-offset-4 hover:text-(--bazaar-marigold)">← return to floor</a>
      </header>
      <div className="security-thread-band mt-3" aria-hidden="true" />
      <p className="mb-8 mt-4 inline-block seal seal-red">
        synthetic traffic · measured honestly from the ledger
      </p>

      {!m ? (
        <p className="text-(--bazaar-ink-dim)">loading ledger…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Money moved (captured)" value={`₹${m.money.captured_inr.toLocaleString("en-IN")}`} sub={`${m.money.captured_count} transactions`} />
            <Tile label="Recovery rate" value={pct(m.money.recovery_rate)} sub={`${m.money.recovered_count} of ${m.money.failed_count} failures recovered`} tone="good" />
            <Tile label="Gate rate" value={pct(m.policy.gate_rate)} sub={`${m.policy.gate} of ${m.policy.total_decisions} decisions went to a human`} tone="warn" />
            <Tile label="Upsell attach" value={pct(m.growth.attach_rate)} sub={`${m.growth.suggestions_accepted}/${m.growth.suggestions_presented} suggestions accepted`} />
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Approval latency p50" value={m.human_in_loop.approval_latency_seconds.p50 !== null ? `${m.human_in_loop.approval_latency_seconds.p50}s` : "—"} sub={`p95 ${m.human_in_loop.approval_latency_seconds.p95 ?? "—"}s · ${m.human_in_loop.approvals_granted} approvals`} />
            <Tile label="Policy verdicts" value={`${m.policy.allow}/${m.policy.gate}/${m.policy.deny}`} sub="allow / gate / deny" />
            <Tile label="Failed payments" value={String(m.money.failed_count)} sub={`${m.money.attempts_total} total attempts`} tone="bad" />
            <Tile label="Sessions" value={String(Object.values(m.sessions_by_provider).reduce((a, b) => a + b, 0))} sub={Object.entries(m.sessions_by_provider).map(([k, v]) => `${k}:${v}`).join(" · ") || "none yet"} />
          </section>

          <section className="mt-6 border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-4 font-clause text-xs text-(--bazaar-ink-dim)">
            <span className="font-bold text-(--bazaar-ink)">Reading this page:</span> every transaction above walked a signed mandate chain and the policy gate before touching real test-mode rails. Failures are shown because they were engineered to happen, then recovered. Full trail:{" "}
            <a href="/api/metrics" className="underline hover:text-(--bazaar-marigold)">/api/metrics</a>.
          </section>

          <footer className="mt-6 pt-3 text-center font-clause text-[11px] text-(--bazaar-ink-dim)">
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
