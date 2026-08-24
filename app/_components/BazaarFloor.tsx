"use client";

import { useEffect, useMemo, useState } from "react";
import { useBazaarStream, dotClassFor, type LiveEvent } from "./EventFeedContext";

/**
 * THE BAZAAR FLOOR — a live view of real agent commerce.
 *
 * Not a game skin over mock data: every dot walking to a stall, every mandate
 * card that lands, every bell ring is driven by an actual event from the
 * pipeline. If the floor is quiet, no money is moving; when it moves,
 * you watch it happen.
 */

type Product = {
  id: string;
  sku: string;
  title: string;
  category: string;
  price_paise: number;
  stock: number;
  stall_x: number;
  stall_y: number;
};

const CATEGORY_EMOJI: Record<string, string> = {
  chai: "🫖",
  mithai: "🍬",
  snacks: "🥟",
  decor: "🪔",
  cricket: "🏏",
};

const CELL_W = 168;
const CELL_H = 96;

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

type AgentDot = { sessionId: string; label: string; x: number; y: number };

export default function BazaarFloor() {
  const { connected, last } = useBazaarStream();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d: { products: Product[] }) => {
        const list = d.products ?? [];
        setProducts(list);
        primeFloorCatalog(list);
      })
      .catch(() => {});
  }, []);

  // Reduce the event stream into what the floor renders.
  const agents = useMemo(() => reduceAgents(last), [last]);
  const cards = useMemo(() => reduceCards(last), [last]);
  const pendingApproval = useMemo(
    () => last.find((e) => e.type === "approval.requested")?.payload ?? null,
    [last]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* ── Floor ─────────────────────────────────────────────── */}
      <section className="relative overflow-x-auto rounded-2xl border border-(--bazaar-line) bg-(--bazaar-panel) p-4">
        <header className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-medium uppercase tracking-widest text-(--bazaar-ink-dim)">
            Bazaar floor
          </h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${connected ? "bg-emerald-950 text-emerald-300" : "bg-stone-800 text-stone-400"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-stone-500"}`} />
            {connected ? "live" : "connecting…"}
          </span>
        </header>

        <svg
          viewBox={`0 0 ${6 * CELL_W} ${4 * CELL_H}`}
          className="min-w-[640px]"
          role="img"
          aria-label="Live map of the bazaar: stalls and shopping agents"
        >
          <defs>
            <pattern id="cobble" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M0 24H24" stroke="var(--bazaar-line)" strokeWidth="0.5" opacity="0.35" />
              <path d="M24 0V24" stroke="var(--bazaar-line)" strokeWidth="0.5" opacity="0.35" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cobble)" />

          {products.map((p) => (
            <g key={p.id} transform={`translate(${p.stall_x * CELL_W + 8}, ${p.stall_y * CELL_H + 8})`}>
              <rect
                width={CELL_W - 16}
                height={CELL_H - 16}
                rx="10"
                fill="var(--bazaar-bg)"
                stroke="var(--bazaar-line)"
                strokeWidth="1"
              />
              <text x="12" y="26" fontSize="18">{CATEGORY_EMOJI[p.category] ?? "🏪"}</text>
              <text x="38" y="25" fontSize="11" fill="var(--bazaar-ink)" fontWeight="600">
                {p.title.length > 17 ? `${p.title.slice(0, 16)}…` : p.title}
              </text>
              <text x="38" y="42" fontSize="10" fill="var(--bazaar-saffron)">
                {rupees(p.price_paise)}
              </text>
              <text x="12" y={CELL_H - 22} fontSize="9" fill="var(--bazaar-ink-dim)">
                {p.sku} · stock {p.stock}
              </text>
            </g>
          ))}

          {/* Agent dots — positioned by real events, moved with CSS transitions */}
          {agents.map((a) => (
            <g key={a.sessionId} style={{ transform: `translate(${a.x}px, ${a.y}px)`, transition: "transform 900ms cubic-bezier(.4,0,.2,1)" }}>
              <circle r="13" fill="var(--bazaar-panel)" stroke="var(--bazaar-saffron)" strokeWidth="1.5" />
              <text textAnchor="middle" dy="4" fontSize="13">🤖</text>
            </g>
          ))}
        </svg>

        {pendingApproval && (
          <div className="absolute right-6 top-14 max-w-xs animate-bounce rounded-xl border border-(--bazaar-marigold) bg-black/80 p-3 shadow-lg">
            <div className="text-sm font-semibold text-(--bazaar-marigold)">🔔 Shopkeeper! A gate tripped</div>
            <div className="mt-1 text-xs text-(--bazaar-ink-dim)">
              {rupees(Number(pendingApproval.amount_paise ?? 0))} needs human approval — decide in{" "}
              <a href="/approvals" className="underline">the queue</a>.
            </div>
          </div>
        )}
      </section>

      {/* ── Mandate card feed ──────────────────────────────────── */}
      <aside className="rounded-2xl border border-(--bazaar-line) bg-(--bazaar-panel) p-4">
        <h2 className="text-sm font-medium uppercase tracking-widest text-(--bazaar-ink-dim)">
          Ledger — as it happens
        </h2>
        <ol className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {cards.length === 0 && (
            <li className="rounded-lg border border-dashed border-(--bazaar-line) p-4 text-center text-sm text-(--bazaar-ink-dim)">
              Quiet bazaar. Send an agent:{" "}
              <code className="rounded bg-black/40 px-1">POST /api/agents/run</code>
            </li>
          )}
          {cards.map((c) => (
            <li key={c.key} className={`rounded-lg border p-2.5 text-xs ${c.tone}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.icon} {c.title}</span>
                <span className="text-[10px] opacity-60">{c.ago}</span>
              </div>
              {c.detail && <div className="mt-1 opacity-75">{c.detail}</div>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/* ── Stream reducers ──────────────────────────────────────────────── */

function reduceAgents(events: LiveEvent[]): AgentDot[] {
  const map = new Map<string, AgentDot>();
  for (const e of events) {
    if (!e.session_id) continue;
    if (e.type === "agent.arrived") {
      map.set(e.session_id, { sessionId: e.session_id, label: String(e.payload?.agent_id ?? "agent"), x: 20, y: 20 });
    }
    const sku = e.payload?.args && typeof e.payload.args === "object"
      ? (e.payload.args as { items?: { sku?: string }[] }).items?.[0]?.sku ??
        (e.payload.args as { sku?: string }).sku
      : undefined;
    if (sku && map.has(e.session_id)) {
      const dot = map.get(e.session_id)!;
      const target = stallCenter(sku);
      if (target) map.set(e.session_id, { ...dot, ...target });
    }
  }
  return [...map.values()];
}

let CATALOG: Product[] = [];
export function primeFloorCatalog(products: Product[]): void {
  CATALOG = products;
}
function stallCenter(sku: string): { x: number; y: number } | null {
  const p = CATALOG.find((x) => x.sku === sku);
  return p ? { x: p.stall_x * CELL_W + CELL_W / 2, y: p.stall_y * CELL_H + CELL_H / 2 } : null;
}

type Card = { key: string; icon: string; title: string; detail?: string; tone: string; ago: string };

function reduceCards(events: LiveEvent[]): Card[] {
  const out: Card[] = [];
  for (const e of events.slice(0, 40)) {
    const c = eventToCard(e);
    if (c) out.push(c);
  }
  return out;
}

function eventToCard(e: LiveEvent): Card | null {
  const ago = e.ts ? new Date(e.ts).toLocaleTimeString("en-IN", { hour12: false }) : "";
  const amt = Number(e.payload?.amount_paise ?? 0);
  switch (e.type) {
    case "mandate.signed.intent":
      return { key: e.id!, icon: "🧾", title: `INTENT signed by user`, detail: `bound ₹${rupeesP(e.payload)}`, tone: "border-(--bazaar-blue)/40 bg-blue-950/30", ago };
    case "mandate.signed.cart":
      return { key: e.id!, icon: "🛒", title: "CART signed by agent", detail: `hash ${short(e.payload)}`, tone: "border-(--bazaar-line) bg-black/20", ago };
    case "mandate.signed.payment":
      return { key: e.id!, icon: "🤝", title: "PAYMENT signed by merchant", detail: `hash ${short(e.payload)}`, tone: "border-(--bazaar-line) bg-black/20", ago };
    case "policy.allow":
      return { key: e.id!, icon: "✅", title: `Policy allowed ${rupees(amt)}`, tone: "border-emerald-900 bg-emerald-950/40", ago };
    case "policy.gate":
      return { key: e.id!, icon: "🔔", title: `Policy GATED ${rupees(amt)} → human`, tone: "border-(--bazaar-marigold)/50 bg-amber-950/40", ago };
    case "policy.deny":
      return { key: e.id!, icon: "⛔", title: `Policy DENIED ${rupees(amt)}`, detail: firstReason(e), tone: "border-red-900 bg-red-950/40", ago };
    case "payment.link_issued":
      return { key: e.id!, icon: "🏦", title: `Rails issued · attempt ${String(e.payload?.attempt ?? 1)}`, detail: `order ${shortId(String(e.payload?.rzp_order_id ?? ""))}`, tone: "border-(--bazaar-line) bg-black/20", ago };
    case "payment.captured":
      return { key: e.id!, icon: "💰", title: `CAPTURED ${rupees(amt)}`, detail: "webhook verified", tone: "border-emerald-700 bg-emerald-900/50", ago };
    case "payment.failed":
      return { key: e.id!, icon: "⚠️", title: `FAILED ${rupees(amt)}`, detail: String(e.payload?.failure_reason ?? ""), tone: "border-red-800 bg-red-950/50", ago };
    case "payment.recovered":
      return { key: e.id!, icon: "🛟", title: "RECOVERED on retry", tone: "border-emerald-800 bg-emerald-950/50", ago };
    case "suggestion.accepted":
      return { key: e.id!, icon: "📈", title: "Suggestion accepted (attach ↑)", tone: "border-(--bazaar-blue)/40 bg-blue-950/30", ago };
    default:
      return null;
  }
}

function rupeesP(payload: Record<string, unknown> | undefined): string {
  const v = Number(payload?.amount_paise ?? payload?.max_amount_paise ?? 0);
  return (v / 100).toLocaleString("en-IN");
}
function short(payload: Record<string, unknown> | undefined): string {
  return String(payload?.hash ?? "").slice(0, 10);
}
function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}
function firstReason(e: LiveEvent): string | undefined {
  const reasons = e.payload?.reasons;
  if (Array.isArray(reasons) && reasons[0] && typeof reasons[0] === "object") {
    return String((reasons[0] as { detail?: string }).detail ?? "");
  }
  return undefined;
}
