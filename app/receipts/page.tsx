"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FilterBar, PageHeader, StatusStamp, type FilterOption } from "../_components/gazette";

/**
 * AUDIT TRAIL — "why did this transaction happen, and what happened at
 * every step?" The list answers "what settled"; every receipt links to the
 * full mandate-chain detail view that answers "why".
 */
type Receipt = {
  id: string;
  amount_paise: number;
  updated_at: string;
  rzp_payment_id: string;
  rzp_order_id: string;
  status: string;
  attempt: number;
  payment_mandate_id: string;
  session_id: string;
  cart_hash: string;
  policy_verdict: string | null;
  campaign_name: string | null;
  campaign_discount_paise: number | null;
  approval_outcome: string | null;
  items: { sku: string; qty: number }[];
};

type Filter = "all" | "today" | "gated" | "recovered";

type ReceiptsData = {
  receipts: Receipt[];
  counts: Record<Filter, number>;
  summary: {
    shown: number;
    captured_paise: number;
    campaign_name: string | null;
  };
};

/** Money always carries its paise: ₹1,174 or ₹2,378.30 — never ₹2,378.3. */
const rupees = (paise: number) => {
  const v = paise / 100;
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

function when(utc: string): string {
  try {
    return new Date(utc + "Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return utc;
  }
}

export default function ReceiptsPage() {
  const [data, setData] = useState<ReceiptsData | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const genRef = useRef(0);

  // ?filter= and ?campaign= arrive as deep links (Standing Orders, Campaign
  // Manager). Unknown values fall back to "all" rather than an empty list.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("filter");
    if (f === "today" || f === "gated" || f === "recovered") setFilter(f);
    const c = p.get("campaign");
    if (c) setCampaignId(c);
  }, []);

  const load = useCallback(() => {
    // Only the newest fetch may write state — the unscoped first request
    // can resolve after the campaign-scoped one and must not clobber it.
    const gen = ++genRef.current;
    fetch(`/api/receipts?filter=${filter}${campaignId ? `&campaign=${campaignId}` : ""}`)
      .then((r) => r.json())
      .then((d: ReceiptsData) => {
        if (gen === genRef.current) setData(d);
      })
      .catch(() => {});
  }, [filter, campaignId]);

  useEffect(load, [load]);

  const options: FilterOption<Filter>[] = [
    { value: "all", label: "All", count: data?.counts.all },
    { value: "today", label: "Today", count: data?.counts.today },
    { value: "gated", label: "Gated", count: data?.counts.gated },
    { value: "recovered", label: "Recovered", count: data?.counts.recovered },
  ];

  const q = query.trim().toLowerCase();
  const receipts = (data?.receipts ?? []).filter(
    (r) =>
      !q ||
      r.rzp_payment_id.toLowerCase().includes(q) ||
      r.rzp_order_id.toLowerCase().includes(q) ||
      r.session_id.toLowerCase().includes(q) ||
      r.cart_hash.toLowerCase().includes(q) ||
      r.items.some((i) => i.sku.toLowerCase().includes(q))
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 min-h-screen">
      <PageHeader title="Audit Trail" kicker="why every transaction happened, step by step" />

      {/* ── Campaign scope notice (deep link from Campaign Manager) ── */}
      {campaignId && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-[1.5px] border-(--thread) bg-(--paper-deep) px-4 py-2.5">
          <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
            Campaign scope
          </span>
          <span className="font-masthead text-[13px] font-bold uppercase tracking-wide text-(--ink)">
            {data?.summary.campaign_name ?? campaignId}
          </span>
          <button
            onClick={() => setCampaignId(null)}
            className="press ml-auto min-h-6 border-[1.5px] border-(--ink) bg-transparent px-3 py-1 font-clause text-[11px] font-bold uppercase tracking-wider text-(--ink) hover:bg-(--ink) hover:text-(--paper)"
          >
            Show all receipts
          </button>
        </div>
      )}

      {/* ── Summary ─────────────────────────────────────────────── */}
      <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Audit summary">
        <div>
          <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Settled receipts</div>
          <div className="digits mt-0.5 text-2xl text-(--ink)">{data?.summary.shown ?? "—"}</div>
        </div>
        <div>
          <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Captured</div>
          <div className="digits mt-0.5 text-2xl text-(--ink)">
            {data ? rupees(data.summary.captured_paise) : "—"}
          </div>
        </div>
        <p className="fig max-w-sm">
          <span className="pointer" aria-hidden="true" />
          every receipt links to its full mandate chain — intent, cart, policy, campaign, settlement.
        </p>
      </section>

      {/* ── Filter + search ─────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-y border-(--paper-edge) py-3">
        <FilterBar options={options} value={filter} onChange={setFilter} ariaLabel="Filter receipts" />
        <div className="ml-auto">
          <label className="flex items-center gap-2">
            <span className="visually-hidden">Search receipts by ID, session, hash or SKU</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search txn id / sku / session…"
              className="w-64 border border-(--paper-edge) bg-(--paper) px-2.5 py-1.5 font-clause text-xs text-(--ink) placeholder:text-(--ink-faint) focus:border-(--ink) focus:shadow-[0_0_0_1.5px_var(--seal)] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* ── Receipts ────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {!data ? (
          <p className="col-span-full font-clause text-xs text-(--ink-soft)">loading the ledger…</p>
        ) : receipts.length === 0 ? (
          <div className="col-span-full border-[1.5px] border-dashed border-(--ink-soft) bg-(--paper-deep) p-8 text-center">
            <div className="flex justify-center"><StatusStamp state="neutral">no receipts</StatusStamp></div>
            <p className="mt-3 font-body text-[13px] text-(--ink-soft)">
              Nothing matches. Settled transactions appear here the moment a payment captures.
            </p>
          </div>
        ) : (
          receipts.map((r) => (
            <Link
              key={r.id}
              href={`/receipts/${r.id}`}
              className="group relative flex flex-col rule-box p-5 transition-shadow hover:shadow-[4px_4px_0_var(--ink)] focus-visible:shadow-[4px_4px_0_var(--ink)]"
            >
              <div className="text-center border-b border-dashed border-(--ink-faint) pb-3 mb-3">
                <h2 className="font-masthead text-lg tracking-widest text-(--ink)">THE AGENT BAZAAR</h2>
                <p className="text-[11px] uppercase tracking-widest text-(--ink-faint) mt-0.5">Official Receipt</p>
              </div>

              <div className="flex-1 space-y-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-(--ink-faint)">Date</span>
                  <span className="text-right">{when(r.updated_at)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-(--ink-faint)">Txn ID</span>
                  <span className="digits text-[11px]">{r.rzp_payment_id || "N/A"}</span>
                </div>

                {/* State facts — policy, campaign, payment */}
                <div className="space-y-1.5 border-t border-dashed border-(--ink-faint) pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-(--ink-faint) uppercase tracking-wider text-[11px]">Policy</span>
                    <StatusStamp state={r.policy_verdict === "allow" ? "ok" : r.policy_verdict === "gate" ? "warn" : "bad"}>
                      {r.policy_verdict ?? "—"}
                    </StatusStamp>
                  </div>
                  {r.campaign_name && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-(--ink-faint) uppercase tracking-wider text-[11px]">Campaign</span>
                      <span className="font-clause text-[11px] text-(--ink)">{r.campaign_name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-(--ink-faint) uppercase tracking-wider text-[11px]">Payment</span>
                    <StatusStamp state={r.status === "captured" ? "ok" : "warn"}>
                      {r.status === "recovered" ? "recovered" : "settled"}
                    </StatusStamp>
                  </div>
                  {r.approval_outcome && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-(--ink-faint) uppercase tracking-wider text-[11px]">Human</span>
                      <StatusStamp state={r.approval_outcome === "approved" ? "ok" : "bad"}>
                        {r.approval_outcome}
                      </StatusStamp>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-(--ink-faint) pt-3">
                  <span className="text-(--ink-faint) uppercase text-[11px] tracking-wider mb-1.5 block">Items</span>
                  <ul className="space-y-0.5">
                    {r.items.slice(0, 4).map((item, i) => (
                      <li key={i} className="flex justify-between font-clause text-[11px]">
                        <span>{item.qty}× {item.sku}</span>
                      </li>
                    ))}
                    {r.items.length > 4 && (
                      <li className="fig">+ {r.items.length - 4} more</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="border-t-2 border-(--ink) pt-3 mt-4 flex justify-between items-end">
                <span className="uppercase text-(--ink-faint) text-[11px] tracking-wider">Total Paid</span>
                <span className="digits text-lg">{rupees(r.amount_paise)}</span>
              </div>

              <p className="fig mt-2 text-center">
                <span className="pointer" aria-hidden="true" />
                view the full chain →
              </p>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none opacity-[0.12] z-0">
                <div className="seal seal-green scale-150">SETTLED</div>
              </div>
            </Link>
          ))
        )}
      </div>

      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Every receipt above is cryptographically linked to a signed mandate chain.
        </p>
      </footer>
    </main>
  );
}
