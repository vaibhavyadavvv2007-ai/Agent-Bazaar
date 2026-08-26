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
    setBellNote(decision === "approved" ? `Gate opened in ${seconds}s; rails issuing…` : `Refused in ${seconds}s; the agent gets a structured no.`);
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approval_id: bell.approvalId, decision, decided_by: "shopkeeper-floor" }),
    }).catch(() => {});
    setBell(null);
    setTimeout(() => setBellNote(null), 6000);
  }

  return (
    <section className="rule-box relative overflow-hidden rounded-none p-3">
        <header className="flex items-center gap-3 px-1 pb-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 font-clause text-[11px] uppercase tracking-[0.14em] ${connected ? "bg-(--henna)/10 text-(--henna)" : "bg-(--paper-deep) text-(--ink-soft)"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-(--henna)" : "bg-(--ink-faint)"}`} />
            {connected ? "notice board · live" : "connecting…"}
          </span>
          <span className="font-clause text-[11px] text-(--ink-soft)">every notice is a real agent session · every clause a signed mandate</span>
        </header>

        <svg viewBox={`0 0 ${W} 420`} className="min-w-[720px]" role="img" aria-label="The bazaar street, drawn as a gazette illustration: stalls, lamps and shopping agents">
          {/* paper grid: faint ruled columns like a printed plate */}
          <defs>
            <pattern id="plate" width="52" height="52" patternUnits="userSpaceOnUse">
              <path d="M0 52H52" stroke="var(--paper-edge)" strokeWidth="0.5" opacity="0.5" />
              <path d="M52 0V52" stroke="var(--paper-edge)" strokeWidth="0.5" opacity="0.35" />
            </pattern>
          </defs>
          <rect width={W} height="420" fill="url(#plate)" />

          {/* the wire across the lane, ink lamps hanging into the street */}
          <line x1="0" y1="146" x2={W} y2="146" stroke="var(--ink)" strokeWidth="2" />
          {[110, 330, 550, 770, 990].map((x) => (
            <g key={x}>
              <path d={`M ${x} 146 q 4 10 0 18`} stroke="var(--ink)" strokeWidth="1.5" fill="none" />
              <rect x={x - 8} y="162" width="16" height="26" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
              <path d={`M ${x - 8} 170 h16 M ${x - 5} 176 h10`} stroke="var(--ink)" strokeWidth="1" />
              <circle cx={x} cy="194" r="2.2" fill="var(--seal)" />
            </g>
          ))}

          {/* stalls — ink-line shopfronts with striped awnings */}
          {products.map((p) => {
            const s = stallPos(p);
            return (
              <g key={p.id} transform={`translate(${s.x}, ${s.y})`}>
                <rect width="132" height="96" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
                <path
                  d="M0 16 h132 M8 16 l10 -12 h96 l10 12"
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path d="M0 22 h132" stroke="var(--seal)" strokeWidth="2" opacity="0.85" />
                <text x="10" y="40" fontSize="15">{CATEGORY_EMOJI[p.category] ?? "🏪"}</text>
                <text x="32" y="40" fontSize="11.5" fill="var(--ink)" fontWeight="600" className="font-masthead" style={{ fontSize: 11 }}>
                  {p.title.length > 15 ? `${p.title.slice(0, 14)}…` : p.title}
                </text>
                <text x="32" y="56" fontSize="11" fill="var(--seal)" className="font-clause">
                  {rupees(p.price_paise)}
                </text>
                <text x="10" y="84" fontSize="8.5" fill="var(--ink-soft)" className="font-clause">
                  {p.sku} · stock {p.stock}
                </text>
              </g>
            );
          })}

          {/* agents — ink monograms with speech notes */}
          {agents.map((a) => (
            <g key={a.sessionId} style={{ transform: `translate(${a.x}px, ${a.y}px)`, transition: "transform 900ms cubic-bezier(.4,0,.2,1)" }}>
              {a.bubble && (
                <g>
                  <rect x="-8" y="-58" width={Math.min(190, 8 + a.bubble.length * 6.4)} height="22" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                  <path d="M4 -36 l6 8 l6 -8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                  <text x="0" y="-43" fontSize="10.5" fill="var(--ink)" className="font-clause">{a.bubble}</text>
                </g>
              )}
              <circle r="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
              <text textAnchor="middle" dy="4" fontSize="11" fill="var(--seal)" className="font-masthead">A</text>
              <text textAnchor="middle" y="30" fontSize="9" fill="var(--ink-soft)" className="font-clause">{a.name}</text>
            </g>
          ))}

          {/* the empty-street invitation */}
          {agents.length === 0 && (
            <text x={W / 2} y={LANE_Y + 58} textAnchor="middle" fontSize="12.5" fill="var(--ink-soft)" className="font-clause">
              The street is quiet. Send an agent: POST /api/agents/run and it will be notified here.
            </text>
          )}
        </svg>

        {/* ══ SUMMONS — the gate wants a human ══ */}
        {bell && (
          <div className="absolute right-4 top-12 w-72 border-2 border-(--seal) bg-(--paper) p-3 shadow-[0_10px_28px_rgba(28,26,23,0.22)]">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="bell-swing inline-block h-6 w-6" aria-hidden="true">
                <path
                  d="M12 3c-3.2 0-5 2.4-5 5.5V13l-1.8 2.6c-.3.5 0 1.1.6 1.1h12.4c.6 0 .9-.6.6-1.1L17 13V8.5C17 5.4 15.2 3 12 3Z"
                  fill="var(--paper)"
                  stroke="var(--seal)"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="var(--seal)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span className="font-masthead text-lg uppercase tracking-wide text-(--seal)">Summons</span>
            </div>
            <div className="mt-1 font-clause text-sm">{rupees(bell.amount)}</div>
            <div className="mt-0.5 font-clause text-[11px] text-(--ink-soft)">{bell.reason}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => decide("approved")} className="press flex-1 border border-(--henna) bg-(--henna)/10 px-3 py-1.5 font-clause text-sm font-bold text-(--henna) hover:bg-(--henna)/20">
                Allow entry
              </button>
              <button onClick={() => decide("rejected")} className="press flex-1 border border-(--seal) px-3 py-1.5 font-clause text-sm font-bold text-(--seal) hover:bg-(--seal)/10">
                Refuse
              </button>
            </div>
            <div className="fig mt-1.5 text-center"><span className="pointer" aria-hidden="true" />your latency is being recorded</div>
          </div>
        )}
        {bellNote && <div className="absolute bottom-3 left-4 border border-(--ink) bg-(--paper) px-3 py-1.5 font-clause text-xs">{bellNote}</div>}
      </section>
  );
}

/* ══ NOTIFICATIONS — the audit trail as numbered gazette clauses ═══ */

export function BillBook() {
  const { last } = useBazaarStream();
  // Seed from the permanent record on load; the live stream continues it.
  const [seeded, setSeeded] = useState<LiveEvent[]>([]);
  useEffect(() => {
    fetch("/api/events?limit=40")
      .then((r) => r.json())
      .then((d: { events: LiveEvent[] }) => setSeeded(d.events ?? []))
      .catch(() => {});
  }, []);
  const merged = useMemo(() => {
    const seen = new Set<string>();
    const all: LiveEvent[] = [];
    for (const e of [...seeded, ...last]) {
      const id = e.id ?? `${e.type}:${e.ts}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
    return all; // oldest first
  }, [seeded, last]);
  const receipts = useMemo(() => reduceReceipts([...merged].reverse()), [merged]);

  return (
    <aside className="rule-box h-fit p-3">
      <header className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-masthead text-sm uppercase tracking-[0.08em]">Notifications</h2>
        <span className="font-clause text-[10px] uppercase tracking-[0.14em] text-(--ink-soft)">append-only</span>
      </header>
      <div className="security-thread-band" aria-hidden="true" />
      <ol className="scroll-column max-h-[600px] space-y-2 overflow-y-auto p-1 pt-2">
        {receipts.length === 0 && (
          <li className="border border-dashed border-(--paper-edge) p-4 text-center font-clause text-xs text-(--ink-soft)">
            No notifications yet. When agents spend, every mandate is notified here:
            numbered, sealed, permanent.
          </li>
        )}
        {receipts.map((r, idx) => (
          <li key={r.key} className="typeset-in border border-(--paper-edge) bg-[#faf6ea] px-3 py-2 font-clause text-[11px]">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">No. {String(receipts.length - idx).padStart(3, "0")}</span>
              <span className="text-[9px] text-(--ink-faint)">{r.ago}</span>
            </div>
            {r.lines.filter(Boolean).map((l, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : "text-(--ink-soft)"}>{l}</div>
            ))}
            {r.stamp && (
              <div
                className={`seal mt-1.5 text-[10px] ${
                  r.stamp.tone === "good" ? "seal-green" : r.stamp.tone === "warn" ? "seal-gold" : "seal-red"
                }`}
              >
                {r.stamp.text}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="security-thread-band" aria-hidden="true" />
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
