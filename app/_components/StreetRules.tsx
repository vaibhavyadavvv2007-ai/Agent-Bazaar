"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * STANDING ORDERS — the shopkeeper's walls as numbered gazette orders.
 * Sliders write the REAL policy_rules via PUT /api/policy; the clause text
 * re-typesets live as you drag (the specimen raise).
 */
type Rule = {
  id: string;
  kind: "daily_cap" | "velocity" | "category_deny" | "max_single";
  enabled: boolean;
  config: { limit_paise?: number; max_txns?: number; window_minutes?: number; category?: string };
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const RULE_META: Record<Rule["kind"], { no: string; title: string }> = {
  daily_cap: { no: "I", title: "Daily Purse" },
  max_single: { no: "II", title: "Single Purchase Limit" },
  velocity: { no: "III", title: "Velocity of Purchases" },
  category_deny: { no: "IV", title: "Prohibited Goods" },
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
        setNote("The Standing Orders have been amended. The street enforces them now.");
        setTimeout(() => setNote(null), 3500);
        load();
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rule-box p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="font-masthead text-sm uppercase tracking-[0.08em]">Standing Orders</h2>
        <span className="font-clause text-[10px] uppercase tracking-[0.14em] text-(--ink-soft)">
          binding on all agents
        </span>
      </header>
      <div className="double-rule mt-2" aria-hidden="true" />

      {note && (
        <p className="typeset-in mt-2 border border-(--henna) bg-(--henna)/10 px-3 py-1.5 font-clause text-xs text-(--henna)">
          {note}
        </p>
      )}

      <ol className="mt-3 space-y-3">
        {rules.map((rule) => {
          const meta = RULE_META[rule.kind];
          const disabled = saving === rule.id;
          const inForce = rule.enabled;
          return (
            <li key={rule.id} className="border border-(--paper-edge) bg-[#faf6ea] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] leading-snug">
                  <span className="font-clause font-bold">Order {meta.no}.</span>{" "}
                  <span className="font-semibold">{meta.title}.</span>{" "}
                  <ClauseText rule={rule} />
                </p>
                <button
                  onClick={() => update(rule, { enabled: !inForce })}
                  disabled={disabled}
                  className={`seal press shrink-0 text-[9px] ${inForce ? "seal-green" : "seal-red"}`}
                  aria-label={`${inForce ? "Repeal" : "Restore"} Order ${meta.no}`}
                >
                  {inForce ? "In force" : "Repealed"}
                </button>
              </div>

              {rule.kind === "daily_cap" && (
                <Drag
                  min={100} max={5000} step={100}
                  value={(rule.config.limit_paise ?? 500000) / 100}
                  disabled={disabled || !inForce}
                  onCommit={(v) => update(rule, { limit_inr: v })}
                />
              )}
              {rule.kind === "max_single" && (
                <Drag
                  min={100} max={3000} step={50}
                  value={(rule.config.limit_paise ?? 150000) / 100}
                  disabled={disabled || !inForce}
                  onCommit={(v) => update(rule, { limit_inr: v })}
                />
              )}
              {rule.kind === "velocity" && (
                <Drag
                  min={1} max={20} step={1}
                  value={rule.config.max_txns ?? 5}
                  disabled={disabled || !inForce}
                  onCommit={(v) => update(rule, { max_txns: v })}
                />
              )}
              {rule.kind === "category_deny" && (
                <p className="fig mt-1.5">
                  <span className="pointer" aria-hidden="true" />
                  Fig. 4: goods of category “{rule.config.category ?? "—"}” are refused at the wall.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <p className="fig mt-3">
        <span className="pointer" aria-hidden="true" />
        Fig. 5: these are not illustrations of rules. They are the rules. Amend an Order and the
        next cart meets it.
      </p>
    </section>
  );
}

/** The clause text, re-typeset live from the rule's current config. */
function ClauseText({ rule }: { rule: Rule }) {
  switch (rule.kind) {
    case "daily_cap":
      return (
        <>
          No agent shall spend more than{" "}
          <b className="font-clause">{rupees(rule.config.limit_paise ?? 0)}</b> in one day.
        </>
      );
    case "max_single":
      return (
        <>
          A single purchase exceeding{" "}
          <b className="font-clause">{rupees(rule.config.limit_paise ?? 0)}</b> shall be held for
          the Shopkeeper&apos;s decision.
        </>
      );
    case "velocity":
      return (
        <>
          No agent shall complete more than{" "}
          <b className="font-clause">{rule.config.max_txns ?? 0} purchases per hour</b>.
        </>
      );
    case "category_deny":
      return (
        <>
          Goods of category <b className="font-clause">{rule.config.category ?? "—"}</b> are
          refused to all agents.
        </>
      );
  }
}

function Drag(props: {
  min: number; max: number; step: number; value: number;
  disabled?: boolean; onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);

  return (
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={v}
      disabled={props.disabled}
      onChange={(e) => setV(Number(e.target.value))}
      onMouseUp={() => props.onCommit(v)}
      onTouchEnd={() => props.onCommit(v)}
      onKeyUp={() => props.onCommit(v)}
      className="mt-2 h-1.5 w-full accent-(--seal)"
      aria-label="Amend this order"
    />
  );
}
