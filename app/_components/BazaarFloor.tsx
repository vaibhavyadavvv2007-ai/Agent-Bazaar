"use client";

import { useEffect, useMemo, useState } from "react";
import { useBazaarStream, hueFor, type LiveEvent } from "./EventFeedContext";

/**
 * THE PLAYABLE SHOPKEEPER FLOOR.
 *
 * A night street market you govern. Every agent dot is a real API session;
 * every receipt printed on the roll is a real signed mandate; the bell rings
 * only when the REAL policy engine wants a human. The game is a viewer over
 * truth — if it dies, the dashboard still tells the story.
 *
 * Signature elements: the carbon-copy receipt roll (the audit trail as a
 * bill book, rubber stamps included) and the shopkeeper's brass bell.
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

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/* Lane geometry (viewBox units) */
const W = 1160;
const TOP_Y = 34;
const BOTTOM_Y = 268;
const LANE_Y = 176; // the walkable street between stall rows
const COL_W = 160;

function stallPos(p: Product): { x: number; y: number } {
  // seed grid: stall_y 0 → top row · 1 → bottom row · 2 (13th stall) → top row, extra column
  const col = Math.max(0, Math.round(p.stall_x));
  const y = Math.round(p.stall_y);
  const top = y !== 1;
  const x = 52 + (top && y === 2 ? 6 : col) * COL_W;
  return { x, y: top ? TOP_Y : BOTTOM_Y };
}
function apronPos(p: Product): { x: number; y: number } {
  const s = stallPos(p);
  return { x: s.x + 46, y: s.y + (s.y === TOP_Y ? 118 : -34) };
}

type Agent = {
  sessionId: string;
  name: string;
  hue: string;
  x: number;
  y: number;
  bubble: string;
  lastTs: number;
};

type Receipt = {
  key: string;
  lines: string[];
  stamp?: { text: string; tone: "good" | "warn" | "bad" };
  tone: string;
  ago: string;
};

type Bell = { approvalId: string; amount: number; reason: string; rangAt: number };

export function Street() {
  const { connected, last } = useBazaarStream();
  const [products, setProducts] = useState<Product[]>([]);
  const [bell, setBell] = useState<Bell | null>(null);
  const [bellNote, setBellNote] = useState<string | null>(null);

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

  const agents = useMemo(() => reduceAgents(last), [last]);

  // Bell gameplay off the live stream.
  useEffect(() => {
    for (const e of last) {
      if (e.type === "approval.requested" && e.payload?.approval_id) {
        const id = String(e.payload.approval_id);
        setBell((b) => (b?.approvalId === id ? b : { approvalId: id, amount: Number(e.payload?.amount_paise ?? 0), reason: firstReason(e) ?? "policy gate", rangAt: Date.now() }));
      }
      if (e.type === "approval.approved" || e.type === "approval.rejected") setBell(null);
    }
  }, [last]);

  async function decide(decision: "approved" | "rejected") {
    if (!bell) return;
    const seconds = ((Date.now() - bell.rangAt) / 1000).toFixed(1);
    setBellNote(decision === "approved" ? `Gate opened in ${seconds}s — rails issuing…` : `Refused in ${seconds}s — the agent gets a structured no.`);
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approval_id: bell.approvalId, decision, decided_by: "shopkeeper-floor" }),
    }).catch(() => {});
    setBell(null);
    setTimeout(() => setBellNote(null), 6000);
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-(--stall-edge) bg-(--night-deep) p-3">
        <header className="flex items-center gap-3 px-1 pb-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${connected ? "bg-emerald-950 text-emerald-300" : "bg-stone-800 text-stone-400"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-stone-500"}`} />
            {connected ? "street live" : "connecting…"}
          </span>
          <span className="text-xs text-(--haldi)">every dot is a real agent session · every receipt a signed mandate</span>
        </header>

        <svg viewBox={`0 0 ${W} 420`} className="min-w-[720px]" role="img" aria-label="Night bazaar street with stalls, lanterns and shopping agents">
          {/* cobblestones */}
          <defs>
            <pattern id="cobble" width="26" height="22" patternUnits="userSpaceOnUse">
              <path d="M0 22H26" stroke="var(--stall-edge)" strokeWidth="0.6" opacity="0.4" />
              <path d="M26 0V22" stroke="var(--stall-edge)" strokeWidth="0.6" opacity="0.25" />
            </pattern>
            <radialGradient id="lanternPool" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="var(--lantern)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--lantern)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={W} height="420" fill="url(#cobble)" />

          {/* the wire across the lane, lanterns hanging into the street */}
          <line x1="0" y1="146" x2={W} y2="146" stroke="var(--stall-edge)" strokeWidth="2.5" />
          {[110, 330, 550, 770, 990].map((x) => (
            <g key={x}>
              <path d={`M ${x} 146 q 4 10 0 18`} stroke="var(--stall-edge)" strokeWidth="1.5" fill="none" />
              <ellipse cx={x} cy="205" rx="72" ry="42" fill="url(#lanternPool)" />
              <rect x={x - 7} y="162" width="14" height="26" rx="6" fill="var(--lantern)" opacity="0.95" />
              <line x1={x - 7} y1="170" x2={x + 7} y2="170" stroke="var(--night-deep)" strokeWidth="1.2" opacity="0.5" />
              <circle cx={x} cy="192" r="2" fill="var(--lantern)" />
            </g>
          ))}

          {/* stalls */}
          {products.map((p) => {
            const s = stallPos(p);
            return (
              <g key={p.id} transform={`translate(${s.x}, ${s.y})`}>
                <rect width="132" height="96" rx="9" fill="var(--stall)" stroke="var(--stall-edge)" />
                <rect x="0" y="0" width="132" height="16" rx="9" fill="var(--stall-edge)" opacity="0.7" />
                <text x="10" y="34" fontSize="17">{CATEGORY_EMOJI[p.category] ?? "🏪"}</text>
                <text x="34" y="33" fontSize="11" fill="var(--chalk)" fontWeight="600" className="font-sign">
                  {p.title.length > 15 ? `${p.title.slice(0, 14)}…` : p.title}
                </text>
                <text x="34" y="49" fontSize="11" fill="var(--lantern)" className="font-receipt">
                  {rupees(p.price_paise)}
                </text>
                <text x="10" y="82" fontSize="8.5" fill="var(--haldi)" className="font-receipt">
                  {p.sku} · stock {p.stock}
                </text>
              </g>
            );
          })}

          {/* agent dots with speech bubbles */}
          {agents.map((a) => (
            <g key={a.sessionId} style={{ transform: `translate(${a.x}px, ${a.y}px)`, transition: "transform 900ms cubic-bezier(.4,0,.2,1)" }}>
              {a.bubble && (
                <g>
                  <rect x="-8" y="-58" width={Math.min(190, 8 + a.bubble.length * 6.1)} height="22" rx="8" fill="var(--stall)" stroke="var(--stall-edge)" />
                  <text x="0" y="-43" fontSize="10.5" fill="var(--chalk)">{a.bubble}</text>
                </g>
              )}
              <circle r="14" fill="var(--night-deep)" stroke={a.hue} strokeWidth="2.5" />
              <text textAnchor="middle" dy="4.5" fontSize="14">🤖</text>
              <text textAnchor="middle" y="30" fontSize="9" fill={a.hue} className="font-receipt">{a.name}</text>
            </g>
          ))}

          {/* the empty-street invitation */}
          {agents.length === 0 && (
            <text x={W / 2} y={LANE_Y + 58} textAnchor="middle" fontSize="13" fill="var(--haldi)">
              The street is quiet. Send an agent: POST /api/agents/run — or open this page next to a demo run.
            </text>
          )}
        </svg>

        {/* ══ THE BELL — gameplay moment ══ */}
        {bell && (
          <div className="absolute right-4 top-12 w-72 rounded-xl border border-(--marigold) bg-black/85 p-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="bell-swing inline-block text-2xl">🔔</span>
              <span className="font-sign text-lg text-(--marigold)">GATE TRIPPED</span>
            </div>
            <div className="mt-1 font-receipt text-sm text-(--chalk)">{rupees(bell.amount)}</div>
            <div className="mt-0.5 text-xs text-(--haldi)">{bell.reason}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => decide("approved")} className="flex-1 rounded-lg bg-(--henna) px-3 py-1.5 text-sm font-semibold text-black hover:brightness-110">
                Open gate
              </button>
              <button onClick={() => decide("rejected")} className="flex-1 rounded-lg border border-(--kumkum) px-3 py-1.5 text-sm font-semibold text-(--kumkum) hover:bg-red-950/50">
                Refuse
              </button>
            </div>
            <div className="mt-1.5 text-center text-[10px] text-(--haldi)">your latency is being measured</div>
          </div>
        )}
        {bellNote && <div className="absolute bottom-3 left-4 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-(--lantern-soft)">{bellNote}</div>}
      </section>
  );
}

/* ══ THE BILL BOOK — the audit trail as a receipt roll ═════════════ */

export function BillBook() {
  const { last } = useBazaarStream();
  const receipts = useMemo(() => reduceReceipts(last), [last]);

  return (
    <aside className="rounded-2xl border border-(--stall-edge) bg-(--night-deep) p-3">
      <header className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-sign text-sm tracking-wide text-(--haldi)">BILL BOOK</h2>
        <span className="font-receipt text-[10px] text-(--haldi)">append-only · tear-proof</span>
      </header>
      <div className="receipt-roll max-h-[560px] space-y-2.5 overflow-y-auto p-2.5">
        {receipts.length === 0 && (
          <div className="rounded-lg border border-dashed border-(--stall-edge) p-4 text-center text-xs text-(--haldi)">
            No bills yet. When agents spend, every mandate prints here — signed, stamped, permanent.
          </div>
        )}
        {receipts.map((r) => (
          <div key={r.key} className="receipt-card tear-out px-3 py-2 font-receipt text-[11px]">
            {r.lines.map((l, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : "opacity-80"}>{l}</div>
            ))}
            {r.stamp && (
              <div className={`stamp mt-1.5 text-[10px] font-bold uppercase ${r.stamp.tone === "good" ? "text-(--henna)" : r.stamp.tone === "warn" ? "text-(--marigold)" : "text-(--kumkum)"}`}>
                {r.stamp.text}
              </div>
            )}
            <div className="mt-1 text-right text-[9px] opacity-50">{r.ago}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ── Stream reducers ──────────────────────────────────────────────── */

function reduceAgents(events: LiveEvent[]): Agent[] {
  const map = new Map<string, Agent>();
  // `events` is newest-first; replay oldest → newest so the latest state wins.
  for (const e of [...events].reverse()) {
    if (!e.session_id) continue;
    const existing = map.get(e.session_id);
    if (e.type === "agent.arrived") {
      map.set(e.session_id, {
        sessionId: e.session_id,
        name: shortName(String(e.payload?.agent_id ?? "agent")),
        hue: hueFor(e.session_id),
        x: 120 + map.size * 90,
        y: LANE_Y,
        bubble: "arrived 🙏",
        lastTs: Date.now(),
      });
      continue;
    }
    if (!existing) continue;

    // Harness events carry {args}; tool-surface events carry fields directly.
    const args = ((e.payload?.args ?? e.payload) ?? {}) as { sku?: string; items?: { sku?: string }[]; query?: string };
    const sku = args.sku ?? args.items?.[0]?.sku;
    const target = sku ? CATALOG_INDEX.get(sku) : undefined;
    let bubble = existing.bubble;

    if (e.type === "agent.searched_catalog") bubble = `browsing ${args.query ? `"${args.query}"` : "the stalls"}…`;
    else if (e.type === "agent.tool.create_intent_mandate") bubble = "permission signed 🧾";
    else if (e.type === "agent.tool.propose_cart" || e.type === "mandate.signed.cart") bubble = "cart committed 🛒";
    else if (e.type === "agent.tool.request_checkout") bubble = "asking the gate…";
    else if (e.type === "policy.allow") bubble = "allowed ✅";
    else if (e.type === "policy.gate") bubble = "rang the bell 🔔";
    else if (e.type === "policy.deny") bubble = "denied ⛔";
    else if (e.type === "payment.captured") bubble = "paid! 💰";
    else if (e.type === "payment.failed") bubble = "payment failed ⚠️";
    else if (e.type === "payment.recovered") bubble = "recovered 🛟";
    else if (e.type === "agent.left") bubble = "left 👋";

    map.set(e.session_id, {
      ...existing,
      x: target ? apronPos(target).x : existing.x,
      y: target ? apronPos(target).y : existing.y,
      bubble,
      lastTs: Date.now(),
    });
  }
  return [...map.values()];
}

function shortName(agentId: string): string {
  const [, persona] = agentId.split("/");
  return (persona ?? agentId).slice(0, 12);
}

const CATALOG_INDEX = new Map<string, Product>();
export function primeFloorCatalog(products: Product[]): void {
  CATALOG_INDEX.clear();
  for (const p of products) CATALOG_INDEX.set(p.sku, p);
}

function reduceReceipts(events: LiveEvent[]): Receipt[] {
  const out: Receipt[] = [];
  for (const e of events.slice(0, 60)) {
    const r = eventToReceipt(e);
    if (r) out.push(r);
  }
  return out;
}

function eventToReceipt(e: LiveEvent): Receipt | null {
  const ago = e.ts ? new Date(e.ts).toLocaleTimeString("en-IN", { hour12: false }) : "";
  const amt = Number(e.payload?.amount_paise ?? 0);
  const paiseLine = amt ? rupees(amt) : "";
  switch (e.type) {
    case "mandate.signed.intent":
      return { key: e.id!, lines: [`INTENT · user-signed`, `bound ${rupees(Number(e.payload?.max_amount_paise ?? e.payload?.amount_paise ?? 0))}`, `hash ${short(e.payload)}`], tone: "", ago };
    case "mandate.signed.cart":
      return { key: e.id!, lines: [`CART · agent-signed`, `hash ${short(e.payload)}`], tone: "", ago };
    case "mandate.signed.payment":
      return { key: e.id!, lines: [`PAYMENT · merchant-signed`, `hash ${short(e.payload)}`], tone: "", ago };
    case "policy.allow":
      return { key: e.id!, lines: [`policy · ALLOW`, paiseLine], stamp: { text: "allowed", tone: "good" }, tone: "", ago };
    case "policy.gate":
      return { key: e.id!, lines: [`policy · GATE → human`, paiseLine, firstReason(e) ?? ""], stamp: { text: "held", tone: "warn" }, tone: "", ago };
    case "policy.deny":
      return { key: e.id!, lines: [`policy · DENY`, paiseLine, firstReason(e) ?? ""], stamp: { text: "denied", tone: "bad" }, tone: "", ago };
    case "payment.checkout_open":
      return { key: e.id!, lines: [`rails · checkout open`, `attempt ${String(e.payload?.attempt ?? 1)} · ${paiseLine}`, `order ${shortId(String(e.payload?.rzp_order_id ?? ""))}`], tone: "", ago };
    case "payment.captured":
      return { key: e.id!, lines: [`PAYMENT CAPTURED`, paiseLine, `order ${shortId(String(e.payload?.rzp_order_id ?? ""))}`], stamp: { text: "captured", tone: "good" }, tone: "", ago };
    case "payment.failed":
      return { key: e.id!, lines: [`payment failed`, paiseLine, String(e.payload?.failure_reason ?? "").slice(0, 46)], stamp: { text: "failed", tone: "bad" }, tone: "", ago };
    case "payment.recovered":
      return { key: e.id!, lines: [`RECOVERY`, `earlier failure marked recovered`], stamp: { text: "recovered", tone: "good" }, tone: "", ago };
    case "suggestion.accepted":
      return { key: e.id!, lines: [`upsell accepted`, `attach rate ↑`], tone: "", ago };
    default:
      return null;
  }
}

function short(payload: Record<string, unknown> | undefined): string {
  return String(payload?.hash ?? "").slice(0, 10);
}
function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
}
function firstReason(e: LiveEvent): string | undefined {
  const reasons = e.payload?.reasons;
  if (Array.isArray(reasons) && reasons[0] && typeof reasons[0] === "object") {
    return String((reasons[0] as { detail?: string }).detail ?? "");
  }
  return undefined;
}
