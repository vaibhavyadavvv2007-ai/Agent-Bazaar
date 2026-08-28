import { describe, it, expect } from "vitest";
import {
  evaluateCampaigns,
  type Campaign,
  type CartItem,
} from "./engine";

const now = "2026-08-27T12:00:00Z";
const past = "2026-08-26T12:00:00Z";
const future = "2026-08-28T12:00:00Z";

const baseCampaigns: Campaign[] = [
  {
    id: "c1",
    name: "Mithai Bundle",
    description: "Buy 2+ mithai items, get 15% off",
    kind: "bundle",
    enabled: true,
    starts_at: past,
    ends_at: future,
    config: { categories: ["mithai"], min_items: 2, discount_percent: 15 },
  },
  {
    id: "c2",
    name: "Chai Flash Sale",
    description: "Masala Chai Kit at ₹299",
    kind: "flash_sale",
    enabled: true,
    starts_at: past,
    ends_at: future,
    config: { skus: ["CHAI-MSL-001"], sale_price_paise: 29900 },
  },
  {
    id: "c3",
    name: "Cross-Sell Deal",
    description: "Buy from 2+ categories, 10% off cheapest",
    kind: "cross_sell",
    enabled: true,
    starts_at: past,
    ends_at: future,
    config: { min_categories: 2, discount_percent: 10 },
  },
];

const mithaiCart: CartItem[] = [
  { sku: "MITH-KAJU-004", title: "Kaju Katli", category: "mithai", qty: 1, unit_price_paise: 74900, line_total_paise: 74900 },
  { sku: "MITH-LADD-005", title: "Laddoo Box", category: "mithai", qty: 1, unit_price_paise: 42500, line_total_paise: 42500 },
];

const chaiCart: CartItem[] = [
  { sku: "CHAI-MSL-001", title: "Masala Chai Kit", category: "chai", qty: 1, unit_price_paise: 34900, line_total_paise: 34900 },
];

const mixedCart: CartItem[] = [
  { sku: "MITH-KAJU-004", title: "Kaju Katli", category: "mithai", qty: 1, unit_price_paise: 74900, line_total_paise: 74900 },
  { sku: "SNCK-SAMS-007", title: "Samosa Pack", category: "snacks", qty: 1, unit_price_paise: 12000, line_total_paise: 12000 },
];

describe("campaign engine", () => {
  describe("bundle campaigns", () => {
    it("applies 15% off when 2+ mithai items in cart", () => {
      const result = evaluateCampaigns(baseCampaigns, mithaiCart, now);
      expect(result.applicable).toHaveLength(1);
      expect(result.applicable[0].kind).toBe("bundle");
      expect(result.applicable[0].discount_paise).toBe(Math.floor(117400 * 0.15)); // 17610
      expect(result.total_discount_paise).toBe(Math.floor(117400 * 0.15));
    });

    it("does not apply bundle when fewer than min_items", () => {
      const singleMithai: CartItem[] = [
        { sku: "MITH-KAJU-004", title: "Kaju Katli", category: "mithai", qty: 1, unit_price_paise: 74900, line_total_paise: 74900 },
      ];
      const result = evaluateCampaigns(baseCampaigns, singleMithai, now);
      expect(result.applicable.find((r) => r.kind === "bundle")).toBeUndefined();
    });

    it("does not apply bundle when no qualifying categories", () => {
      const result = evaluateCampaigns(baseCampaigns, chaiCart, now);
      expect(result.applicable.find((r) => r.kind === "bundle")).toBeUndefined();
    });
  });

  describe("flash sale campaigns", () => {
    it("applies flash sale discount on qualifying SKU", () => {
      const result = evaluateCampaigns(baseCampaigns, chaiCart, now);
      expect(result.applicable).toHaveLength(1);
      expect(result.applicable[0].kind).toBe("flash_sale");
      expect(result.applicable[0].discount_paise).toBe(5000); // 34900 - 29900
    });

    it("does not apply flash sale when SKU not in cart", () => {
      const result = evaluateCampaigns(baseCampaigns, mithaiCart, now);
      expect(result.applicable.find((r) => r.kind === "flash_sale")).toBeUndefined();
    });

    it("does not apply when sale price >= original price", () => {
      const expensiveCampaign: Campaign[] = [
        {
          id: "c2-expensive",
          name: "Expensive Flash Sale",
          description: "",
          kind: "flash_sale",
          enabled: true,
          starts_at: past,
          ends_at: future,
          config: { skus: ["CHAI-MSL-001"], sale_price_paise: 40000 },
        },
      ];
      const result = evaluateCampaigns(expensiveCampaign, chaiCart, now);
      expect(result.applicable.find((r) => r.kind === "flash_sale")).toBeUndefined();
    });
  });

  describe("cross-sell campaigns", () => {
    it("applies 10% off cheapest when 2+ categories in cart", () => {
      const result = evaluateCampaigns(baseCampaigns, mixedCart, now);
      expect(result.applicable).toHaveLength(1);
      expect(result.applicable[0].kind).toBe("cross_sell");
      // Cheapest is Samosa Pack at 12000, 10% = 1200
      expect(result.applicable[0].discount_paise).toBe(1200);
    });

    it("does not apply cross-sell with single category", () => {
      const result = evaluateCampaigns(baseCampaigns, mithaiCart, now);
      expect(result.applicable.find((r) => r.kind === "cross_sell")).toBeUndefined();
    });
  });

  describe("time windows", () => {
    it("does not apply campaign before starts_at", () => {
      const futureCampaign: Campaign[] = [
        { ...baseCampaigns[0], starts_at: future, ends_at: "2026-08-29T12:00:00Z" },
      ];
      const result = evaluateCampaigns(futureCampaign, mithaiCart, now);
      expect(result.applicable).toHaveLength(0);
    });

    it("does not apply campaign after ends_at", () => {
      const expiredCampaign: Campaign[] = [
        { ...baseCampaigns[0], starts_at: "2026-08-20T12:00:00Z", ends_at: past },
      ];
      const result = evaluateCampaigns(expiredCampaign, mithaiCart, now);
      expect(result.applicable).toHaveLength(0);
    });
  });

  describe("disabled campaigns", () => {
    it("skips disabled campaigns", () => {
      const disabled: Campaign[] = [
        { ...baseCampaigns[0], enabled: false },
        { ...baseCampaigns[1], enabled: false },
        { ...baseCampaigns[2], enabled: false },
      ];
      const result = evaluateCampaigns(disabled, mithaiCart, now);
      expect(result.applicable).toHaveLength(0);
    });
  });

  describe("multiple campaigns", () => {
    it("stacks multiple applicable discounts", () => {
      // Mixed cart: mithai + snacks → bundle (mithai) + cross-sell
      const result = evaluateCampaigns(baseCampaigns, mixedCart, now);
      const kinds = result.applicable.map((r) => r.kind);
      expect(kinds).toContain("cross_sell");
      // Total discount should be sum of individual discounts
      const sum = result.applicable.reduce((s, r) => s + r.discount_paise, 0);
      expect(result.total_discount_paise).toBe(sum);
    });

    it("caps total discount at cart total (never negative)", () => {
      const tinyCart: CartItem[] = [
        { sku: "SNCK-SAMS-007", title: "Samosa Pack", category: "snacks", qty: 1, unit_price_paise: 100, line_total_paise: 100 },
        { sku: "DECO-DIYA-009", title: "Diya Set", category: "decor", qty: 1, unit_price_paise: 100, line_total_paise: 100 },
      ];
      const bigDiscount: Campaign[] = [
        {
          id: "c3-big",
          name: "Big Cross-Sell",
          description: "",
          kind: "cross_sell",
          enabled: true,
          starts_at: past,
          ends_at: future,
          config: { min_categories: 2, discount_percent: 90 },
        },
      ];
      const result = evaluateCampaigns(bigDiscount, tinyCart, now);
      expect(result.final_total_paise).toBeGreaterThanOrEqual(0);
      expect(result.total_discount_paise).toBeLessThanOrEqual(200);
    });
  });

  describe("evaluation output", () => {
    it("returns correct original and final totals", () => {
      const result = evaluateCampaigns(baseCampaigns, mithaiCart, now);
      expect(result.original_total_paise).toBe(117400);
      expect(result.final_total_paise).toBe(result.original_total_paise - result.total_discount_paise);
    });

    it("returns empty applicable when no campaigns match", () => {
      const result = evaluateCampaigns([], mithaiCart, now);
      expect(result.applicable).toHaveLength(0);
      expect(result.total_discount_paise).toBe(0);
      expect(result.final_total_paise).toBe(117400);
    });
  });
});
