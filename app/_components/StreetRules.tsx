"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * THE STREET RULES — the shopkeeper's walls.
 *
 * Sliders here write to the REAL policy_rules table via PUT /api/policy.
 * Move a wall, and the next agent cart meets it. Every change is announced
 * on the event stream (policy.updated) so the whole street sees it.
 */

type Rule = {
  id: string;
  kind: "daily_cap" | "velocity" | "category_deny" | "max_single";
  enabled: boolean;
  config: { limit_paise?: number; max_txns?: number; window_minutes?: number; category?: string };
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const RULE_META: Record<Rule["kind"], { title: string; blurb: string }> = {
  daily_cap: { title: "Daily purse", blurb: "Max one agent can spend per day" },
  max_single: { title: "Single-buy limit", blurb: "Above this, the bell rings for you" },
  velocity: { title: "Crowd control", blurb: "Max payments per hour per agent" },
  category_deny: { title: "Banned stall", blurb: "Agents can't touch this category" },
};

export default function StreetRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/policy")
      .then((r) => r.json())
      .then((d: { rules: Rule[] }) => setRules(d.rules ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function update(rule: Rule, body: Record<string, unknown>) {
    setSaving(rule.id);
    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule_id: rule.id, ...body }),
      });
      if (res.ok) {
        setNote("Walls moved — the street enforces them now.");
        setTimeout(() => setNote(null), 3500);
        load();
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-2xl border border-(--stall-edge) bg-(--night-deep) p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="font-sign text-sm tracking-wide text-(--haldi)">STREET RULES — your walls</h2>
        <span className="font-receipt text-[10px] text-(--haldi)">live enforcement</span>
      </header>

      {note && <p className="mt-2 rounded-lg bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-300">{note}</p>}

      <ul className="mt-3 space-y-4">
        {rules.map((rule) => {
          const meta = RULE_META[rule.kind];
          const disabled = saving === rule.id;
          return (
            <li key={rule.id} className="rounded-xl border border-(--stall-edge) bg-(--stall) p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-sign text-sm">{meta.title}</div>
                  <div className="text-[11px] text-(--haldi)">{meta.blurb}</div>
                </div>
                <button
                  onClick={() => update(rule, { enabled: !rule.enabled })}
                  disabled={disabled}
                  className={`h-5 w-9 rounded-full transition-colors ${rule.enabled ? "bg-(--henna)" : "bg-stone-700"}`}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${meta.title}`}
                >
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${rule.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </button>
              </div>

              {rule.kind === "daily_cap" && (
                <Slider
                  min={100} max={5000} step={100}
                  value={(rule.config.limit_paise ?? 500000) / 100}
                  format={(v) => `₹${v.toLocaleString("en-IN")} / day`}
                  disabled={disabled || !rule.enabled}
                  onCommit={(v) => update(rule, { limit_inr: v })}
                />
              )}
              {rule.kind === "max_single" && (
                <Slider
                  min={100} max={3000} step={50}
                  value={(rule.config.limit_paise ?? 150000) / 100}
                  format={(v) => `₹${v.toLocaleString("en-IN")} per buy`}
                  disabled={disabled || !rule.enabled}
                  onCommit={(v) => update(rule, { limit_inr: v })}
                />
              )}
              {rule.kind === "velocity" && (
                <Slider
                  min={1} max={20} step={1}
                  value={rule.config.max_txns ?? 5}
                  format={(v) => `${v} payments / hour`}
                  disabled={disabled || !rule.enabled}
                  onCommit={(v) => update(rule, { max_txns: v })}
                />
              )}
              {rule.kind === "category_deny" && (
                <div className="mt-2 font-receipt text-xs text-(--kumkum)">
                  ⛔ {rule.config.category ?? "—"} — agents refused at the wall
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-snug text-(--haldi)">
        These are not game props — they are the same rules the policy engine enforces on every
        real agent purchase. Tighten them and watch carts get held or denied.
      </p>
    </section>
  );
}

function Slider(props: {
  min: number; max: number; step: number; value: number;
  format: (v: number) => string; disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between">
        <input
          type="range"
          min={props.min} max={props.max} step={props.step}
          value={v}
          disabled={props.disabled}
          onChange={(e) => setV(Number(e.target.value))}
          onMouseUp={() => props.onCommit(v)}
          onTouchEnd={() => props.onCommit(v)}
          onKeyUp={() => props.onCommit(v)}
          className="h-1.5 w-full accent-(--lantern)"
        />
        <span className="ml-3 shrink-0 font-receipt text-xs text-(--lantern-soft)">{props.format(v)}</span>
      </div>
    </div>
  );
}
