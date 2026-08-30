"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { useBazaarStream, hueFor, type LiveEvent } from "./EventFeedContext";
import ConversationalCheckout from "./ConversationalCheckout";

// Simple procedural sound effects (no assets needed)
function playSound(type: "bell" | "stamp" | "arrive" | "kaching") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === "bell") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.5);
    } else if (type === "stamp") {
      // percussive noise
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.connect(gain);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      noise.start(now);
    } else if (type === "arrive") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.1); // C#6
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "kaching") {
      osc.type = "square";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    // Ignore audio errors (e.g. user hasn't interacted with page yet)
  }
}

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

const CATEGORY_LABEL: Record<string, string> = {
  chai: "CHAI",
  mithai: "MITHAI",
  snacks: "SNACKS",
  decor: "DECOR",
  cricket: "CRICKET"
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
  isLeft?: boolean;
};

type Receipt = {
  key: string;
  /** Dominant line — WHAT happened. */
  event: string;
  /** The money involved, if any. Second in the hierarchy. */
  amount?: string;
  /** Secondary lines: reasons, attempts, context. */
  detail: string[];
  /** Technical metadata: hashes, order ids. Weakest ink. */
  meta: string[];
  /** Optional upright status plate (color + word, never color alone). */
  plate?: { text: string; tone: "ok" | "warn" | "bad" | "info" };
  /** Cross-page link — the audit file or the queue for this event. */
  href?: string;
  hrefLabel?: string;
  ago: string;
};

type Bell = { approvalId: string; amount: number; reason: string; rangAt: number };

type CheckoutDetails = {
  payment_row_id: string;
  rzp_order_id: string;
  amount_paise: number;
  discount_paise?: number;
  cart_items: { sku: string; title: string; qty: number; unit_price_paise: number; line_total_paise: number }[];
  agent_message: string;
  session_id: string;
  mandate_id: string;
};

export function Street() {
  const { connected, last } = useBazaarStream();
  const [products, setProducts] = useState<Product[]>([]);
  const [bell, setBell] = useState<Bell | null>(null);
  const [bellNote, setBellNote] = useState<string | null>(null);
  const [checkoutDetails, setCheckoutDetails] = useState<CheckoutDetails | null>(null);

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

  // Bell gameplay & Toast notifications off the live stream.
  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const e of last) {
      if (!e.id || seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);

      if (e.type === "approval.requested" && e.payload?.approval_id) {
        const id = String(e.payload.approval_id);
        setBell((b) => (b?.approvalId === id ? b : { approvalId: id, amount: Number(e.payload?.amount_paise ?? 0), reason: firstReason(e) ?? "policy gate", rangAt: Date.now() }));
      }
      if (e.type === "approval.approved" || e.type === "approval.rejected") setBell(null);
      
      // Sounds and Toasts
      if (e.type === "policy.gate") {
        playSound("bell");
        toast("Summons — human review required", {
          description: "An agent's transaction was paused for your review.",
          action: { label: "Answer it →", onClick: () => window.location.assign("/approvals") },
          className: "font-clause text-[12px] border-2 border-(--warn) bg-(--paper) text-(--ink) rounded-none shadow-[0_4px_16px_rgba(28,26,23,0.18)] p-3",
          style: { fontFamily: "'Courier Prime', monospace" },
        });
      } else      if (e.type === "payment.checkout_conversational") {
        playSound("bell");
        const details: CheckoutDetails = {
          payment_row_id: String(e.payload?.payment_row_id ?? ""),
          rzp_order_id: String(e.payload?.rzp_order_id ?? ""),
          amount_paise: Number(e.payload?.amount_paise ?? 0),
          discount_paise: e.payload?.discount_paise != null ? Number(e.payload.discount_paise) : undefined,
          cart_items: (e.payload?.cart_items as any[]) ?? [],
          agent_message: String(e.payload?.agent_message ?? ""),
          session_id: String(e.session_id ?? ""),
          mandate_id: String(e.payload?.mandate_id ?? ""),
        };
        setCheckoutDetails(details);
      } else if (e.type === "payment.captured") {
        playSound("kaching");
        toast.success(`Payment Captured`, { description: `₹${((Number(e.payload?.amount_paise) || 0) / 100).toLocaleString("en-IN")} settled.` });
      } else if (e.type === "agent.arrived") {
        playSound("arrive");
        toast(`Agent arrived`, { description: `Persona: ${e.payload?.persona}` });
      } else if (e.type.startsWith("mandate.signed")) {
        playSound("stamp");
      }
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

        <div className="scroll-column overflow-x-auto">
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
              <circle cx={x} cy="194" r="2.2" fill="var(--rust)" />
            </g>
          ))}

          {/* stalls — ink-line shopfronts with striped awnings */}
          {products.map((p) => {
            const s = stallPos(p);
            const out = p.stock <= 0;
            return (
              <g key={p.id} transform={`translate(${s.x}, ${s.y})`} opacity={out ? 0.55 : 1}>
                <rect width="132" height="96" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
                <path
                  d="M0 16 h132 M8 16 l10 -12 h96 l10 12"
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                  fill="none"
                />
                {/* Awning stripe — NON-semantic rust accent (was seal red,
                    which read as "danger" on every card). */}
                <path d="M0 22 h132" stroke="var(--rust)" strokeWidth="2" opacity="0.7" />
                <text x="10" y="36" fontSize="9" fill="var(--ink-soft)" fontWeight="700" className="font-clause" letterSpacing="0.08em">{CATEGORY_LABEL[p.category] ?? "STALL"}</text>
                {/* Product name — dominant */}
                <text x="10" y="52" fontSize="11.5" fill="var(--ink)" fontWeight="700" className="font-masthead" style={{ fontSize: 11.5 }}>
                  {p.title.length > 18 ? `${p.title.slice(0, 17)}…` : p.title}
                </text>
                {/* Price — second in hierarchy, ink (not red) */}
                <text x="10" y="68" fontSize="11" fill="var(--ink)" fontWeight="700" className="font-clause digits" style={{ fontSize: 11 }}>
                  {rupees(p.price_paise)}
                </text>
                {/* Stock + SKU — tertiary */}
                <text x="10" y="86" fontSize="9" fill="var(--ink-faint)" className="font-clause">
                  {out ? "OUT OF STOCK" : `STOCK ${p.stock}`} · {p.sku}
                </text>
              </g>
            );
          })}

          {/* agents — ink monograms with speech notes */}
          {agents.map((a) => {
            const isRecent = Date.now() - a.lastTs < 2000;
            return (
              <g key={a.sessionId} style={{ transform: `translate(${a.x}px, ${a.y}px)`, opacity: a.isLeft ? 0 : 1, transition: "transform 700ms cubic-bezier(0.32, 0.72, 0, 1), opacity 2000ms ease-out 1500ms" }}>
                {a.bubble && (
                  <g>
                    <rect x="-8" y="-58" width={Math.min(190, 8 + a.bubble.length * 6.4)} height="22" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                    <path d="M4 -36 l6 8 l6 -8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                    <text x="0" y="-43" fontSize="10.5" fill="var(--ink)" className="font-clause">{a.bubble}</text>
                  </g>
                )}
                {/* pulsing ring behind active agents */}
                {isRecent && !a.isLeft && <circle r="16" fill="none" stroke={a.hue} strokeWidth="1.5" className="agent-pulse" opacity="0.6" />}
                <circle r="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
                <text textAnchor="middle" dy="4" fontSize="11" fill="var(--seal)" className="font-masthead">A</text>
                <text textAnchor="middle" y="30" fontSize="9" fill="var(--ink-soft)" className="font-clause">{a.name}</text>
              </g>
            );
          })}

          {/* the empty-street invitation */}
          {agents.length === 0 && (
            <text x={W / 2} y={LANE_Y + 58} textAnchor="middle" fontSize="12.5" fill="var(--ink-soft)" className="font-clause">
              The street is quiet. Send an agent: POST /api/agents/run and it will be notified here.
            </text>
          )}
          </svg>
        </div>

        {/* ══ SUMMONS — the gate wants a human ══ */}
        {bell && (
          <div className="absolute right-4 top-12 w-72 border-2 border-(--warn) bg-(--paper) p-4 shadow-[0_10px_28px_rgba(28,26,23,0.22)]" role="alertdialog" aria-label="Summons: approval required">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="bell-swing inline-block h-6 w-6" aria-hidden="true">
                <path
                  d="M12 3c-3.2 0-5 2.4-5 5.5V13l-1.8 2.6c-.3.5 0 1.1.6 1.1h12.4c.6 0 .9-.6.6-1.1L17 13V8.5C17 5.4 15.2 3 12 3Z"
                  fill="var(--paper)"
                  stroke="var(--warn)"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="var(--warn)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span className="font-masthead text-lg uppercase tracking-wide text-(--warn-ink)">Summons</span>
            </div>
            {/* The amount is the decision input — make it the dominant figure. */}
            <div className="digits mt-2 text-3xl text-(--ink)">{rupees(bell.amount)}</div>
            <div className="font-body mt-1 text-[13px] text-(--ink-soft)">{bell.reason}</div>
            <div className="plate plate-warn mt-2 text-[11px]">
              <span className="dot" aria-hidden="true" />
              A human must decide
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => decide("approved")} className="press flex-1 border-[1.5px] border-(--ok) bg-(--ok-bg) px-3 py-2 font-clause text-sm font-bold text-(--ok-ink) hover:bg-(--ok)/20 disabled:opacity-50">
                Allow entry
              </button>
              <button onClick={() => decide("rejected")} className="press flex-1 border-[1.5px] border-(--bad) bg-transparent px-3 py-2 font-clause text-sm font-bold text-(--bad-ink) hover:bg-(--bad-bg) disabled:opacity-50">
                Refuse
              </button>
            </div>
            <div className="fig mt-2 text-center"><span className="pointer" aria-hidden="true" />your latency is being recorded</div>
          </div>
        )}
        {bellNote && <div className="absolute bottom-3 left-4 border border-(--ink) bg-(--paper) px-3 py-1.5 font-clause text-xs">{bellNote}</div>}

        {/* Conversational checkout modal */}
        {checkoutDetails && (
          <ConversationalCheckout
            details={checkoutDetails}
            onClose={() => setCheckoutDetails(null)}
          />
        )}
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
    
    // `last` is newest-first. Process it first so the freshest events take precedence.
    for (const e of last) {
      const id = e.id ?? `${e.type}:${e.ts}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
    
    // `seeded` is oldest-first (from API). Reverse it to continue the newest-first timeline.
    for (let i = seeded.length - 1; i >= 0; i--) {
      const e = seeded[i];
      const id = e.id ?? `${e.type}:${e.ts}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
    
    return all; // strictly newest-first
  }, [seeded, last]);
  
  // Since `merged` is already newest-first, we just pass it to reduceReceipts directly.
  const receipts = useMemo(() => reduceReceipts(merged), [merged]);

  return (
    <aside className="rule-box h-fit p-3">
      <header className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-masthead text-sm uppercase tracking-[0.08em]">Notifications</h2>
        <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">append-only</span>
      </header>
      <div className="security-thread-band" aria-hidden="true" />
      <ol className="scroll-column max-h-[600px] space-y-2 overflow-y-auto p-1 pt-2" role="log" aria-live="polite" aria-label="Numbered notifications">
        {receipts.length === 0 && (
          <li className="border border-dashed border-(--paper-edge) p-4 text-center font-clause text-xs text-(--ink-soft)">
            No notifications yet. When agents spend, every mandate is notified here:
            numbered, sealed, permanent.
          </li>
        )}
        {receipts.map((r, idx) => (
          <li
            key={r.key}
            className={`typeset-in border bg-(--bazaar-panel) px-3 py-2 ${
              r.plate?.tone === "ok"
                ? "border-l-[3px] border-l-(--ok) border-y-(--paper-edge) border-r-(--paper-edge)"
                : r.plate?.tone === "warn"
                  ? "border-l-[3px] border-l-(--warn) border-y-(--paper-edge) border-r-(--paper-edge)"
                  : r.plate?.tone === "bad"
                    ? "border-l-[3px] border-l-(--bad) border-y-(--paper-edge) border-r-(--paper-edge)"
                    : "border-(--paper-edge)"
            }`}
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            {/* Row 1 — filing number + timestamp (technical, small) */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-clause text-[11px] font-bold text-(--ink-soft)">No. {String(receipts.length - idx).padStart(3, "0")}</span>
              <time className="font-clause text-[11px] tabular-nums text-(--ink-faint)">{r.ago}</time>
            </div>
            {/* Row 2 — WHAT happened (dominant) */}
            <div className="font-masthead mt-0.5 text-[15px] leading-snug text-(--ink)">
              {r.event}
              {r.plate && (
                <span className={`plate ml-2 align-middle text-[11px] plate-${r.plate.tone === "ok" ? "ok" : r.plate.tone === "warn" ? "warn" : r.plate.tone === "bad" ? "bad" : "info"}`}>
                  {r.plate.text}
                </span>
              )}
            </div>
            {/* Row 3 — the money (secondary-dominant) */}
            {r.amount && <div className="digits mt-0.5 text-[15px] text-(--ink)">{r.amount}</div>}
            {/* Row 4 — reasons and context (body ink) */}
            {r.detail.filter(Boolean).map((d, i) => (
              <div key={i} className="font-body mt-0.5 text-[13px] text-(--ink-soft)">{d}</div>
            ))}
            {/* Row 5 — hashes, order ids (weakest ink, mono) */}
            {r.meta.filter(Boolean).map((m, i) => (
              <div key={i} className="fig mt-0.5">{m}</div>
            ))}
            {/* Row 6 — the cross-page link: the queue, or this transaction's file */}
            {r.href && (
              <a
                href={r.href}
                className="mt-1 inline-block min-h-6 font-clause text-[11px] font-bold uppercase tracking-wider text-(--rule-blue) underline decoration-(--rule-blue)/50 underline-offset-2 hover:text-(--ink)"
              >
                {r.hrefLabel ?? "view the file →"}
              </a>
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
        bubble: "arrived",
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
    let isLeft = existing.isLeft;

    if (e.type === "agent.searched_catalog") bubble = `browsing ${args.query ? `"${args.query}"` : "the stalls"}…`;
    else if (e.type === "agent.tool.create_intent_mandate") bubble = "intent signed";
    else if (e.type === "agent.tool.propose_cart" || e.type === "mandate.signed.cart") bubble = "cart committed";
    else if (e.type === "agent.tool.request_checkout") bubble = "asking the gate…";
    else if (e.type === "policy.allow") bubble = "allowed";
    else if (e.type === "policy.gate") bubble = "rang the bell";
    else if (e.type === "policy.deny") bubble = "denied";
    else if (e.type === "payment.captured") bubble = "paid";
    else if (e.type === "payment.failed") bubble = "payment failed";
    else if (e.type === "payment.recovered") bubble = "recovered";
    else if (e.type === "agent.left") {
      bubble = "departed";
      isLeft = true;
    }

    map.set(e.session_id, {
      ...existing,
      x: target ? apronPos(target).x : existing.x,
      y: target ? apronPos(target).y : existing.y,
      bubble,
      isLeft,
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
      return { key: e.id!, event: "Intent mandate signed", detail: ["bound by the user"], meta: [`max ${rupees(Number(e.payload?.max_amount_paise ?? e.payload?.amount_paise ?? 0))}`, `hash ${short(e.payload)}`], ago };
    case "mandate.signed.cart":
      return { key: e.id!, event: "Cart mandate signed", detail: ["committed by the agent"], meta: [`hash ${short(e.payload)}`], ago };
    case "mandate.signed.payment":
      return { key: e.id!, event: "Payment mandate signed", detail: ["signed by the merchant"], meta: [`hash ${short(e.payload)}`], ago };
    case "policy.allow":
      return { key: e.id!, event: "Policy allowed", amount: paiseLine, detail: [], meta: [], plate: { text: "allowed", tone: "ok" }, ago, href: fileHref(e), hrefLabel: "the transaction file →" };
    case "policy.gate":
      return { key: e.id!, event: "Held for human review", amount: paiseLine, detail: [firstReason(e) ?? ""], meta: [], plate: { text: "held", tone: "warn" }, ago, href: "/approvals", hrefLabel: "answer the queue →" };
    case "policy.deny":
      return { key: e.id!, event: "Denied by policy", amount: paiseLine, detail: [firstReason(e) ?? ""], meta: [], plate: { text: "denied", tone: "bad" }, ago, href: fileHref(e), hrefLabel: "the transaction file →" };
    case "payment.checkout_open":
      return { key: e.id!, event: "Checkout open", amount: paiseLine, detail: [`attempt ${String(e.payload?.attempt ?? 1)}`], meta: [`order ${shortId(String(e.payload?.rzp_order_id ?? ""))}`], ago };
    case "payment.captured":
      return { key: e.id!, event: "Payment captured", amount: paiseLine, detail: [], meta: [`order ${shortId(String(e.payload?.rzp_order_id ?? ""))}`], plate: { text: "captured", tone: "ok" }, ago, href: fileHref(e), hrefLabel: "the receipt →" };
    case "payment.failed":
      return { key: e.id!, event: "Payment failed", amount: paiseLine, detail: [String(e.payload?.failure_reason ?? "").slice(0, 46)], meta: [], plate: { text: "failed", tone: "bad" }, ago };
    case "payment.recovered":
      return { key: e.id!, event: "Failure recovered", detail: ["an earlier failed attempt was settled by a later capture"], meta: [], plate: { text: "recovered", tone: "ok" }, ago };
    case "suggestion.accepted":
      return { key: e.id!, event: "Suggestion accepted", detail: ["attach rate ↑"], meta: [], ago };
    case "campaign.applied":
      return { key: e.id!, event: "Campaign applied", amount: paiseLine, detail: [String(e.payload?.campaign_name ?? "discount"), String(e.payload?.detail ?? "")], meta: [], plate: { text: "discount", tone: "ok" }, ago };
    case "campaign.flash_expiring":
      return { key: e.id!, event: "Flash sale expiring", detail: [`${e.payload?.campaign_name ?? ""} — ${e.payload?.seconds_left ?? 0}s remaining`], meta: [], plate: { text: "hurry", tone: "warn" }, ago };
    case "campaign.flash_expired":
      return { key: e.id!, event: "Flash sale ended", detail: [`${e.payload?.campaign_name ?? ""} has expired`], meta: [], plate: { text: "expired", tone: "bad" }, ago };
    default:
      return null;
  }
}

function short(payload: Record<string, unknown> | undefined): string {
  return String(payload?.hash ?? "").slice(0, 10);
}
/** The audit-file deep link for an event, when it names a mandate. */
function fileHref(e: LiveEvent): string | undefined {
  const id = e.payload?.mandate_id ?? e.payload?.payment_row_id;
  return id ? `/receipts/${String(id)}` : undefined;
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
