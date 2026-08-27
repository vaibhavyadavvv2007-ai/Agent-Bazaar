import { describe, expect, it } from "vitest";
import { evaluate, type PolicyRule, type SpendContext } from "./engine";

// Fixed fixtures — no randomness, no clock dependence.
const baseCtx: SpendContext = {
  agent_id: "groq/gift-buyer",
  spent_today_paise: 0,
  txns_in_window: 0,
  cart_total_paise: 20000,
  cart_categories: ["mithai"],
};

const dailyCap: PolicyRule = { id: "r1", agent_id: null, kind: "daily_cap", enabled: true, config: { limit_paise: 50000 } };
const maxSingle: PolicyRule = { id: "r2", agent_id: null, kind: "max_single", enabled: true, config: { limit_paise: 30000 } };
const velocity: PolicyRule = { id: "r3", agent_id: null, kind: "velocity", enabled: true, config: { max_txns: 5, window_minutes: 60 } };
const denyCricket: PolicyRule = { id: "r4", agent_id: null, kind: "category_deny", enabled: true, config: { category: "cricket" } };

describe("policy engine — allow path", () => {
  it("allows a small in-bounds cart with no rule hits", () => {
    const v = evaluate([dailyCap, maxSingle, velocity, denyCricket], baseCtx);
    expect(v.outcome).toBe("allow");
    expect(v.reasons).toHaveLength(0);
  });

  it("ignores rules scoped to a different agent", () => {
    const scoped: PolicyRule = { id: "r5", agent_id: "gemini/other", kind: "max_single", enabled: true, config: { limit_paise: 100 } };
    const v = evaluate([scoped], baseCtx);
    expect(v.outcome).toBe("allow");
  });

  it("ignores disabled rules", () => {
    const off: PolicyRule = { ...denyCricket, enabled: false };
    const v = evaluate([off], { ...baseCtx, cart_categories: ["cricket"] });
    expect(v.outcome).toBe("allow");
  });
});

describe("policy engine — gate path (human approval)", () => {
  it("gates when projected day-spend crosses the cap", () => {
    const ctx = { ...baseCtx, spent_today_paise: 40000 }; // 40000 + 20000 = ₹600 > ₹500
    const v = evaluate([dailyCap], ctx);
    expect(v.outcome).toBe("gate");
    expect(v.reasons[0].kind).toBe("daily_cap");
    expect(v.reasons[0].detail).toContain("crosses");
  });

  it("does NOT gate exactly at the cap boundary (≤ is allowed)", () => {
    const ctx = { ...baseCtx, spent_today_paise: 30000 }; // 30000 + 20000 = ₹500 == cap
    const v = evaluate([dailyCap], ctx);
    expect(v.outcome).toBe("allow");
  });

  it("gates a single oversized transaction", () => {
    const ctx = { ...baseCtx, cart_total_paise: 30001 };
    const v = evaluate([maxSingle], ctx);
    expect(v.outcome).toBe("gate");
    expect(v.reasons[0].kind).toBe("max_single");
  });

  it("gates on velocity once the window is full", () => {
    const ctx = { ...baseCtx, txns_in_window: 5 };
    const v = evaluate([velocity], ctx);
    expect(v.outcome).toBe("gate");
    expect(v.reasons[0].kind).toBe("velocity");
  });
});

describe("policy engine — deny path (hard stop)", () => {
  it("denies a denied category outright", () => {
    const ctx = { ...baseCtx, cart_categories: ["cricket"] };
    const v = evaluate([denyCricket], ctx);
    expect(v.outcome).toBe("deny");
    expect(v.reasons[0].detail).toContain('"cricket"');
  });

  it("denies absurd overshoot beyond 2× the daily cap", () => {
    const ctx = { ...baseCtx, spent_today_paise: 90000 }; // +200 = ₹1100 > 2×₹500
    const v = evaluate([dailyCap], ctx);
    expect(v.outcome).toBe("deny");
    expect(v.reasons[0].detail).toContain("2×");
  });
});

describe("policy engine — combination semantics", () => {
  it("deny outranks gate when both trigger; every hit is reported", () => {
    const ctx: SpendContext = {
      ...baseCtx,
      spent_today_paise: 95000,
      cart_total_paise: 35000,
      cart_categories: ["cricket"],
      txns_in_window: 5,
    };
    const v = evaluate([dailyCap, maxSingle, velocity, denyCricket], ctx);
    expect(v.outcome).toBe("deny");
    // All four rules fired and are individually explainable:
    expect(v.reasons.map((r) => r.kind)).toEqual(
      expect.arrayContaining(["daily_cap", "max_single", "velocity", "category_deny"])
    );
  });

  it("multiple gates combine to a single gate outcome with all reasons", () => {
    const ctx: SpendContext = { ...baseCtx, spent_today_paise: 45000, txns_in_window: 5 };
    const v = evaluate([dailyCap, velocity], ctx);
    expect(v.outcome).toBe("gate");
    expect(v.reasons).toHaveLength(2);
  });
});
