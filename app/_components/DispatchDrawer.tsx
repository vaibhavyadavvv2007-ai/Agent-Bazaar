"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * DISPATCH DRAWER — the shopkeeper's front door for sending agents.
 *
 * A floating action button (bottom-right, gazette-inked) opens a drawer
 * where the shopkeeper picks a scenario or writes a custom task, selects
 * a provider, sets a budget, and dispatches an AI agent. The agent's
 * session appears on the notice board instantly via the SSE stream.
 *
 * Design contract: gazette world. No rounded corners beyond 3px, ink
 * borders, paper fills, seal red for the primary action, Courier Prime
 * for all serial/machine text. Press feedback at scale(0.97).
 */

type Preset = {
  label: string;
  task: string;
  budget: number;
  categories: string[];
  icon: string;
};

const PRESETS: Preset[] = [
  {
    label: "Diwali Sweets",
    task: "Buy the best Diwali sweets you can find. Look for kaju katli, laddoo, or soan papdi. Pick 2 items that complement each other.",
    budget: 1500,
    categories: ["mithai", "chai"],
    icon: "[M]",
  },
  {
    label: "Chai Collection",
    task: "Get a masala chai kit and a kulhad chai set for a chai lover. Browse all the chai options first.",
    budget: 1000,
    categories: ["chai"],
    icon: "[C]",
  },
  {
    label: "Festival Decor",
    task: "Buy Diwali decorations. Get diyas, maybe a rangoli pack, and marigold garlands. Keep it festive.",
    budget: 600,
    categories: ["decor"],
    icon: "[D]",
  },
  {
    label: "Premium Hamper",
    task: "Buy the Premium Diwali Hamper. It is expensive and will likely need shopkeeper approval.",
    budget: 3000,
    categories: ["mithai"],
    icon: "[P]",
  },
  {
    label: "Cricket Bat",
    task: "Buy a Kashmir Willow cricket bat. This will be denied by policy (cricket category is prohibited).",
    budget: 1200,
    categories: ["cricket"],
    icon: "[X]",
  },
];

type Provider = "groq" | "claude";
type DispatchState = "idle" | "dispatching" | "running" | "done" | "error";

type RunResult = {
  session_id?: string;
  summary?: string;
  error?: string;
  detail?: string;
};

export default function DispatchDrawer() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("claude");
  const [task, setTask] = useState("");
  const [budget, setBudget] = useState(1500);
  const [categories, setCategories] = useState("");
  const [state, setState] = useState<DispatchState>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  /* Click outside to close */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    /* Delay to prevent the FAB click from immediately closing */
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const applyPreset = useCallback((p: Preset) => {
    setTask(p.task);
    setBudget(p.budget);
    setCategories(p.categories.join(", "));
  }, []);

  async function dispatch() {
    if (!task.trim()) return;
    setState("dispatching");
    setResult(null);

    const cats = categories
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          agent_id: `${provider}/dispatch-${Date.now()}`,
          persona: "A shopper dispatched from the gazette floor",
          task: task.trim(),
          user_max_inr: budget,
          categories: cats.length > 0 ? cats : undefined,
        }),
      });

      setState("running");

      /* The platform (Vercel timeout, cold-start crash) can answer with a
         plain-text error page instead of our JSON — parse defensively so
         the shopkeeper sees the real message, not a JSON SyntaxError. */
      const raw = await res.text();
      let data: RunResult;
      try {
        data = JSON.parse(raw) as RunResult;
      } catch {
        // A 504 means the serverless function was cut mid-session, not that
        // the agent failed — mandates, checkout and events already persisted.
        // The notice board above is the source of truth.
        data =
          res.status === 504
            ? {
                error: "Session ran long — the connection was cut",
                detail:
                  "The agent's shopping may still have completed. Check the notice board above: if the checkout modal or a summons appeared, the session succeeded.",
              }
            : {
                error: `Agent run failed (HTTP ${res.status})`,
                detail: raw.slice(0, 300),
              };
      }
      setResult(data);
      setState(data.error ? "error" : "done");
    } catch (e) {
      setResult({ error: "Network error", detail: String(e) });
      setState("error");
    }
  }

  function reset() {
    setState("idle");
    setResult(null);
    setTask("");
    setBudget(1500);
    setCategories("");
  }

  return (
    <>
      {/* ── FAB ─────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setOpen(true);
            if (state === "done" || state === "error") reset();
          }
        }}
        className="fab-dispatch press"
        aria-label={open ? "Close dispatch" : "Dispatch an agent"}
        title="Send an AI agent to shop"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {open ? (
            /* X icon */
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            /* Send/dispatch icon (paper airplane) */
            <>
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22 11 13 2 9z" />
            </>
          )}
        </svg>
      </button>

      {/* ── Backdrop ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="dispatch-backdrop"
          aria-hidden="true"
        />
      )}

      {/* ── Drawer ──────────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        className={`dispatch-drawer ${open ? "dispatch-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Dispatch an agent"
      >
        <div className="dispatch-drawer__inner">
          {/* Header */}
          <header className="flex items-baseline justify-between border-b border-(--paper-edge) pb-2">
            <div>
              <h2 className="font-masthead text-sm uppercase tracking-[0.08em]">
                Dispatch Notice
              </h2>
              <p className="fig mt-0.5">
                <span className="pointer" aria-hidden="true" />
                send an AI agent to shop the bazaar
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="press border border-(--paper-edge) px-2.5 py-1 font-clause text-[11px] text-(--ink-soft) hover:border-(--ink)"
              aria-label="Close"
            >
              ESC
            </button>
          </header>

          {state === "idle" || state === "dispatching" || state === "running" ? (
            <>
              {/* Presets */}
              <div className="mt-3">
                <p className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                  Quick scenarios
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="dispatch-preset press"
                      style={{ animationDelay: open ? `${i * 40}ms` : "0ms" }}
                    >
                      <span className="mr-1 text-[13px]">{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="double-rule mt-3" aria-hidden="true" />

              {/* Task */}
              <label className="mt-3 block">
                <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                  Task for the agent
                </span>
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="e.g. Buy the best Diwali gifts under ₹1500"
                  rows={3}
                  className="dispatch-input mt-1 w-full resize-none"
                  disabled={state !== "idle"}
                />
              </label>

              {/* Budget + Provider row */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                    Budget (₹)
                  </span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="dispatch-input mt-1 w-full"
                    disabled={state !== "idle"}
                  />
                </label>
                <label className="block">
                  <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                    Categories (optional)
                  </span>
                  <input
                    type="text"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    placeholder="mithai, chai"
                    className="dispatch-input mt-1 w-full"
                    disabled={state !== "idle"}
                  />
                </label>
              </div>

              {/* Provider toggle */}
              <div className="mt-3">
                <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
                  Provider
                </span>
                <div className="mt-1 flex gap-0">
                  {(["groq", "claude"] as Provider[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`press border border-(--ink) px-3 py-1.5 font-clause text-[11px] font-bold uppercase tracking-[0.1em] transition-colors duration-150 ${
                        provider === p
                          ? "bg-(--ink) text-(--paper)"
                          : "bg-(--paper) text-(--ink) hover:bg-(--paper-deep)"
                      } ${p === "groq" ? "border-r-0" : ""}`}
                      disabled={state !== "idle"}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dispatch button */}
              <button
                onClick={dispatch}
                disabled={!task.trim() || state !== "idle"}
                className="dispatch-cta press mt-4 w-full"
              >
                {state === "idle" ? (
                  <>
                    <svg viewBox="0 0 24 24" className="mr-2 inline-block h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2 11 13" />
                      <path d="M22 2 15 22 11 13 2 9z" />
                    </svg>
                    Dispatch to the Bazaar
                  </>
                ) : state === "dispatching" ? (
                  "Dispatching..."
                ) : (
                  "Agent is shopping..."
                )}
              </button>

              {/* Activity indicator */}
              {(state === "dispatching" || state === "running") && (
                <div className="mt-2 text-center">
                  <div className="dispatch-spinner" />
                  <p className="fig mt-1.5">
                    <span className="pointer" aria-hidden="true" />
                    {state === "dispatching"
                      ? "sending dispatch to the bazaar..."
                      : "agent is walking the stalls. watch the notice board above."}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* ── Result ──────────────────────────────────────────── */
            <div className="mt-3">
              {state === "done" && result && !result.error ? (
                <div className="border border-(--ink-faint) bg-(--paper-deep) p-3">
                  <div className="seal" style={{ color: "var(--ink-soft)" }}>session ended</div>
                  <p className="mt-2 font-body text-[13px] leading-snug text-(--ink)">
                    The agent has completed its script. Check the notice board to see if the cart was successful, denied, or requires payment.
                  </p>
                  {result.session_id && (
                    <p className="fig mt-1.5">
                      <span className="pointer" aria-hidden="true" />
                      session {result.session_id.slice(0, 12)}...
                    </p>
                  )}
                </div>
              ) : (
                <div className="border border-(--seal) bg-(--seal)/8 p-3">
                  <div className="seal seal-red">failed</div>
                  <p className="mt-2 font-body text-[13px] leading-snug text-(--ink)">
                    {result?.error ?? "Unknown error"}
                    {result?.detail && (
                      <>
                        <br />
                        <span className="text-(--ink-soft)">
                          {String(result.detail).slice(0, 200)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              )}

              <button
                onClick={reset}
                className="dispatch-cta press mt-3 w-full"
              >
                Dispatch another agent
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
