/**
 * Campaign engine — the growth layer for the bazaar.
 *
 * PURE FUNCTION: campaigns and cart go in, discount results come out.
 * No DB, no clock injection — callers pass `now` for testability.
 *
 * Three campaign types:
 *   bundle      — buy N+ items from qualifying categories, get X% off
 *   flash_sale  — specific SKUs at a fixed discounted price during a time window
 *   cross_sell  — buy from 2+ different categories, get X% off the cheapest item
 *
 * Every discount is capped so the cart never goes below ₹0.
 * All amounts are in paise (₹1 = 100 paise).
 */

export type CampaignKind = "bundle" | "flash_sale" | "cross_sell";

export type Campaign =
  | {
      id: string;
      name: string;
      description: string;
      kind: "bundle";
      enabled: boolean;
      starts_at: string; // ISO
      ends_at: string; // ISO
      config: {
        categories: string[]; // qualifying categories
        min_items: number; // minimum total items from these categories
        discount_percent: number; // e.g. 15 = 15% off
      };
    }
  | {
      id: string;
      name: string;
      description: string;
      kind: "flash_sale";
      enabled: boolean;
      starts_at: string;
      ends_at: string;
      config: {
        skus: string[]; // specific SKUs on flash sale
        sale_price_paise: number; // fixed sale price per unit
      };
    }
  | {
      id: string;
      name: string;
      description: string;
      kind: "cross_sell";
      enabled: boolean;
      starts_at: string;
      ends_at: string;
      config: {
        min_categories: number; // minimum distinct categories in cart
        discount_percent: number; // percentage off the cheapest qualifying item
        exclude_categories?: string[]; // categories excluded from discount
      };
    };

export type CartItem = {
  sku: string;
  title: string;
  category: string;
  qty: number;
  unit_price_paise: number;
  line_total_paise: number;
};

export type CampaignResult = {
  campaign_id: string;
  campaign_name: string;
  kind: CampaignKind;
  discount_paise: number;
  detail: string;
  affected_skus: string[];
};

export type EvaluationOutput = {
  applicable: CampaignResult[];
  total_discount_paise: number;
  original_total_paise: number;
  final_total_paise: number;
};

/**
 * Evaluate all campaigns against a cart. Returns applicable discounts sorted
 * by best discount first. `now` is an ISO timestamp for time-window checks.
 */
export function evaluateCampaigns(
  campaigns: Campaign[],
  cart: CartItem[],
  now: string = new Date().toISOString()
): EvaluationOutput {
  const nowMs = new Date(now).getTime();
  const originalTotal = cart.reduce((s, i) => s + i.line_total_paise, 0);

  const applicable: CampaignResult[] = [];

  for (const c of campaigns) {
    if (!c.enabled) continue;
    const startMs = new Date(c.starts_at).getTime();
    const endMs = new Date(c.ends_at).getTime();
    if (nowMs < startMs || nowMs > endMs) continue;

    const result = evaluateOne(c, cart);
    if (result && result.discount_paise > 0) {
      applicable.push(result);
    }
  }

  // Sort by discount descending — best deal first
  applicable.sort((a, b) => b.discount_paise - a.discount_paise);

  // Sum discounts, but cap at original total (cart can't go below ₹0)
  let totalDiscount = 0;
  for (const r of applicable) {
    totalDiscount += r.discount_paise;
  }
  totalDiscount = Math.min(totalDiscount, originalTotal);

  return {
    applicable,
    total_discount_paise: totalDiscount,
    original_total_paise: originalTotal,
    final_total_paise: originalTotal - totalDiscount,
  };
}

function evaluateOne(
  c: Campaign,
  cart: CartItem[]
): CampaignResult | null {
  switch (c.kind) {
    case "bundle":
      return evaluateBundle(c, cart);
    case "flash_sale":
      return evaluateFlashSale(c, cart);
    case "cross_sell":
      return evaluateCrossSell(c, cart);
  }
}

function evaluateBundle(
  c: Campaign & { kind: "bundle" },
  cart: CartItem[]
): CampaignResult | null {
  const qualifying = cart.filter((i) =>
    c.config.categories.includes(i.category)
  );
  const totalQualifyingItems = qualifying.reduce((s, i) => s + i.qty, 0);

  if (totalQualifyingItems < c.config.min_items) return null;

  const qualifyingTotal = qualifying.reduce(
    (s, i) => s + i.line_total_paise,
    0
  );
  const discount = Math.floor(
    (qualifyingTotal * c.config.discount_percent) / 100
  );

  if (discount <= 0) return null;

  return {
    campaign_id: c.id,
    campaign_name: c.name,
    kind: "bundle",
    discount_paise: discount,
    detail: `${c.config.discount_percent}% off ${totalQualifyingItems} items from [${c.config.categories.join(", ")}] — bundle deal applied`,
    affected_skus: qualifying.map((i) => i.sku),
  };
}

function evaluateFlashSale(
  c: Campaign & { kind: "flash_sale" },
  cart: CartItem[]
): CampaignResult | null {
  const onSale = cart.filter(
    (i) => c.config.skus.includes(i.sku) && i.unit_price_paise > c.config.sale_price_paise
  );

  if (onSale.length === 0) return null;

  let discount = 0;
  for (const item of onSale) {
    const savings = (item.unit_price_paise - c.config.sale_price_paise) * item.qty;
    discount += savings;
  }

  if (discount <= 0) return null;

  return {
    campaign_id: c.id,
    campaign_name: c.name,
    kind: "flash_sale",
    discount_paise: discount,
    detail: `Flash sale: ${onSale.map((i) => i.title).join(", ")} at ₹${(c.config.sale_price_paise / 100).toLocaleString("en-IN")} each — limited time`,
    affected_skus: onSale.map((i) => i.sku),
  };
}

function evaluateCrossSell(
  c: Campaign & { kind: "cross_sell" },
  cart: CartItem[]
): CampaignResult | null {
  const exclude = c.config.exclude_categories ?? [];
  const eligible = cart.filter((i) => !exclude.includes(i.category));

  const distinctCategories = new Set(eligible.map((i) => i.category));
  if (distinctCategories.size < c.config.min_categories) return null;

  // Discount the cheapest eligible item
  const cheapest = eligible.reduce((min, i) =>
    i.unit_price_paise < min.unit_price_paise ? i : min
  );

  const discount = Math.floor(
    (cheapest.line_total_paise * c.config.discount_percent) / 100
  );

  if (discount <= 0) return null;

  return {
    campaign_id: c.id,
    campaign_name: c.name,
    kind: "cross_sell",
    discount_paise: discount,
    detail: `${c.config.discount_percent}% off ${cheapest.title} — cross-sell from ${distinctCategories.size} categories`,
    affected_skus: [cheapest.sku],
  };
}

/** Helper: create a Campaign from raw DB row */
export function campaignFromRow(row: {
  id: string;
  name: string;
  description: string;
  kind: string;
  config_json: string;
  enabled: number;
  starts_at: string;
  ends_at: string;
}): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind as CampaignKind,
    enabled: row.enabled === 1,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    config: JSON.parse(row.config_json),
  } as Campaign;
}
