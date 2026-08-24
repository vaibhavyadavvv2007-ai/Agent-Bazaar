/**
 * The policy engine — the "bounded" in explainable, bounded, gated.
 *
 * PURE FUNCTION: rules and spend context go in, a verdict with named reasons
 * comes out. No DB, no clock, no randomness — which is exactly what makes it
 * unit-testable to the standard an auditor would want. Callers fetch rules
 * and context; this file decides.
 *
 * Verdict semantics (deliberate, documented):
 *   deny  — hard stop. The agent is told no, with reasons. Nothing proceeds.
 *   gate  — allowed only after a human approves. Transaction parks in the
 *           approval queue ("shopkeeper bell") until decided.
 *   allow — within all bounds; rail issuance proceeds immediately.
 * Deny outranks gate outranks allow; EVERY triggered rule is reported so a
 * denial is never a mystery.
 */

export type RuleKind = "daily_cap" | "velocity" | "category_deny" | "max_single";

export type PolicyRule =
  | { id: string; agent_id: string | null; kind: "daily_cap"; enabled: boolean; config: { limit_paise: number } }
  | { id: string; agent_id: string | null; kind: "max_single"; enabled: boolean; config: { limit_paise: number } }
  | { id: string; agent_id: string | null; kind: "velocity"; enabled: boolean; config: { max_txns: number; window_minutes: number } }
  | { id: string; agent_id: string | null; kind: "category_deny"; enabled: boolean; config: { category: string } };

export type SpendContext = {
  agent_id: string;
  /** Total captured+pending spend for this agent since local midnight. */
  spent_today_paise: number;
  /** Captured+pending transaction count inside the velocity window. */
  txns_in_window: number;
  cart_total_paise: number;
  cart_categories: string[];
};

export type RuleHit = {
  rule_id: string;
  kind: RuleKind;
  outcome: "gate" | "deny";
  detail: string;
};

export type Verdict = {
  outcome: "allow" | "gate" | "deny";
  reasons: RuleHit[];
};

/** Overshoot beyond 2× a cap isn't a "human might approve" case — it's a no. */
const ABSURD_OVERSHOOT_FACTOR = 2;

export function evaluate(rules: PolicyRule[], ctx: SpendContext): Verdict {
  const reasons: RuleHit[] = [];

  const applicable = rules.filter(
    (r) => r.enabled && (r.agent_id === null || r.agent_id === ctx.agent_id)
  );

  for (const rule of applicable) {
    switch (rule.kind) {
      case "daily_cap": {
        const projected = ctx.spent_today_paise + ctx.cart_total_paise;
        if (projected > rule.config.limit_paise * ABSURD_OVERSHOOT_FACTOR) {
          reasons.push({
            rule_id: rule.id,
            kind: rule.kind,
            outcome: "deny",
            detail:
              `projected day-spend ₹${paise(projected)} exceeds 2× the ₹${paise(rule.config.limit_paise)} daily cap`,
          });
        } else if (projected > rule.config.limit_paise) {
          reasons.push({
            rule_id: rule.id,
            kind: rule.kind,
            outcome: "gate",
            detail: `projected day-spend ₹${paise(projected)} crosses the ₹${paise(rule.config.limit_paise)} daily cap`,
          });
        }
        break;
      }

      case "max_single": {
        if (ctx.cart_total_paise > rule.config.limit_paise) {
          reasons.push({
            rule_id: rule.id,
            kind: rule.kind,
            outcome: "gate",
            detail: `cart ₹${paise(ctx.cart_total_paise)} exceeds ₹${paise(rule.config.limit_paise)} single-transaction limit`,
          });
        }
        break;
      }

      case "velocity": {
        if (ctx.txns_in_window >= rule.config.max_txns) {
          reasons.push({
            rule_id: rule.id,
            kind: rule.kind,
            outcome: "gate",
            detail: `${ctx.txns_in_window} transactions in the last ${rule.config.window_minutes} min (limit ${rule.config.max_txns})`,
          });
        }
        break;
      }

      case "category_deny": {
        if (ctx.cart_categories.includes(rule.config.category)) {
          reasons.push({
            rule_id: rule.id,
            kind: rule.kind,
            outcome: "deny",
            detail: `cart contains denied category "${rule.config.category}"`,
          });
        }
        break;
      }
    }
  }

  if (reasons.some((r) => r.outcome === "deny")) return { outcome: "deny", reasons };
  if (reasons.length > 0) return { outcome: "gate", reasons };
  return { outcome: "allow", reasons };
}

function paise(v: number): string {
  return (v / 100).toLocaleString("en-IN");
}
