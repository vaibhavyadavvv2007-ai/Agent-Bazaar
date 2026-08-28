import { db } from "../lib/db";

/**
 * The bazaar's 12 stalls. Coordinates place each stall on the SVG grid
 * (grid is 6x4 — see app/page.tsx visualization). Prices in paise.
 */
type Seed = {
  sku: string;
  title: string;
  description: string;
  category: string;
  price_paise: number;
  stock: number;
  tags: string[];
  stall: [number, number];
};

const CATALOG: Seed[] = [
  { sku: "CHAI-MSL-001", title: "Masala Chai Kit", description: "Assam CTC with cardamom, ginger, clove. Makes 40 cups. The stall that opens before sunrise.", category: "chai", price_paise: 34900, stock: 50, tags: ["festival", "gift"], stall: [0, 0] },
  { sku: "CHAI-KLH-002", title: "Kulhad Chai Set (6)", description: "Six terracotta cups, unglazed, the way chai is supposed to taste. Smells of rain.", category: "chai", price_paise: 49900, stock: 30, tags: ["gift", "kitchen"], stall: [1, 0] },
  { sku: "CHAI-FILT-003", title: "Filter Coffee Powder 500g", description: "Peaberry blend, 80:20. Froth like a Chennai morning.", category: "chai", price_paise: 38900, stock: 40, tags: ["kitchen"], stall: [2, 0] },
  { sku: "MITH-KAJU-004", title: "Kaju Katli Box 500g", description: "The silver leaf diplomat of Indian sweets. Wins every negotiation.", category: "mithai", price_paise: 74900, stock: 25, tags: ["festival", "gift", "premium"], stall: [3, 0] },
  { sku: "MITH-LADD-005", title: "Motichoor Laddoo Box", description: "Twelve laddoos, boondi finer than your excuses.", category: "mithai", price_paise: 42500, stock: 35, tags: ["festival", "gift"], stall: [4, 0] },
  { sku: "MITH-SOAN-006", title: "Soan Papdi Mega Pack", description: "The gift that keeps travelling. Flaky, honeycombed, inevitable.", category: "mithai", price_paise: 29900, stock: 60, tags: ["festival"], stall: [5, 0] },
  { sku: "SNCK-SAMS-007", title: "Garam Samosa Pack (4)", description: "Potato-pea filling, lacquered pastry. Best within 11 minutes. Non-negotiable.", category: "snacks", price_paise: 12000, stock: 80, tags: ["hot"], stall: [0, 1] },
  { sku: "SNCK-BANA-008", title: "Kerala Banana Chips 400g", description: "Fried in coconut oil in front of you, if you know where to look.", category: "snacks", price_paise: 19900, stock: 70, tags: [], stall: [1, 1] },
  { sku: "DECO-DIYA-009", title: "Diwali Diya Set (12)", description: "Hand-thrown earthen lamps, mustard-oil ready. Twelve small suns.", category: "decor", price_paise: 19900, stock: 90, tags: ["festival"], stall: [2, 1] },
  { sku: "DECO-MARI-010", title: "Marigold Garland 3ft", description: "Genda phool, strung at dawn. Doors feel important wearing these.", category: "decor", price_paise: 14900, stock: 45, tags: ["festival", "fresh"], stall: [3, 1] },
  { sku: "DECO-RANG-011", title: "Rangoli Color Pack (7)", description: "Seven powders, one courtyard, infinite arguments about symmetry.", category: "decor", price_paise: 12900, stock: 55, tags: ["festival"], stall: [4, 1] },
  { sku: "CRKT-BAT-012", title: "Kashmir Willow Bat (Size 5)", description: "Tape-ball certified by unanimous verdict of the lane. Gully legend starter pack.", category: "cricket", price_paise: 99900, stock: 15, tags: ["sport"], stall: [5, 1] },
  { sku: "MITH-HAMP-013", title: "Premium Diwali Hamper", description: "Kaju katli, soan papdi, dry fruits, brass diya pair, in a hand-tied box. The one uncles photograph before opening.", category: "mithai", price_paise: 249900, stock: 12, tags: ["festival", "gift", "premium"], stall: [5, 2] },
];

const sql = `
  INSERT INTO products (id, sku, title, description, category, price_paise, stock, tags, stall_x, stall_y)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(sku) DO UPDATE SET
    title=excluded.title,
    description=excluded.description,
    category=excluded.category,
    price_paise=excluded.price_paise,
    stock=excluded.stock,
    tags=excluded.tags,
    stall_x=excluded.stall_x,
    stall_y=excluded.stall_y
`;

for (const p of CATALOG) {
  await db().execute({
    sql,
    args: [p.sku.toLowerCase(), p.sku, p.title, p.description, p.category, p.price_paise, p.stock, JSON.stringify(p.tags), p.stall[0], p.stall[1]],
  });
}

// Default policy set — the bounds every agent operates under until a merchant edits them.
// Tuned so the demo scenarios each trigger exactly one interesting path:
//   ₹1,248 cart → allow · ₹2,499 hamper → gate (max_single) · cricket → deny
const rules = [
  { id: "rule-daily-cap", agent_id: null, kind: "daily_cap", config: { limit_paise: 500000 } },       // ₹5,000/day per agent
  { id: "rule-max-single", agent_id: null, kind: "max_single", config: { limit_paise: 150000 } },     // ₹1,500 single txn → gate
  { id: "rule-velocity", agent_id: null, kind: "velocity", config: { max_txns: 5, window_minutes: 60 } },
  { id: "rule-no-cricket", agent_id: null, kind: "category_deny", config: { category: "cricket" } },  // demo deny rule
];
for (const r of rules) {
  await db().execute({
    sql: `INSERT INTO policy_rules (id, agent_id, kind, config_json) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json, enabled=1`,
    args: [r.id, r.agent_id, r.kind, JSON.stringify(r.config)],
  });
}

// Pre-seed some historical events so the notice board is not empty
const demoEvents = [
  { id: "evt_1", ts: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), session_id: "demo-session-1", type: "agent.arrived", payload: { agent_id: "claude/gift-buyer", persona: "A curious festival shopper" } },
  { id: "evt_2", ts: new Date(Date.now() - 1000 * 60 * 59 * 2).toISOString(), session_id: "demo-session-1", type: "agent.tool.create_intent_mandate", payload: { result: { hash: "3a8b4e72fc" } } },
  { id: "evt_3", ts: new Date(Date.now() - 1000 * 60 * 58 * 2).toISOString(), session_id: "demo-session-1", type: "mandate.signed.intent", payload: { max_amount_paise: 150000, hash: "3a8b4e72fc" } },
  { id: "evt_4", ts: new Date(Date.now() - 1000 * 60 * 55 * 2).toISOString(), session_id: "demo-session-1", type: "agent.tool.propose_cart", payload: { result: { hash: "9f2c1b48da" } } },
  { id: "evt_5", ts: new Date(Date.now() - 1000 * 60 * 54 * 2).toISOString(), session_id: "demo-session-1", type: "mandate.signed.cart", payload: { hash: "9f2c1b48da" } },
  { id: "evt_6", ts: new Date(Date.now() - 1000 * 60 * 53 * 2).toISOString(), session_id: "demo-session-1", type: "agent.tool.request_checkout", payload: { args: { cart_hash: "9f2c1b48da" } } },
  { id: "evt_7", ts: new Date(Date.now() - 1000 * 60 * 52 * 2).toISOString(), session_id: "demo-session-1", type: "policy.allow", payload: { amount_paise: 74900 } },
  { id: "evt_8", ts: new Date(Date.now() - 1000 * 60 * 51 * 2).toISOString(), session_id: "demo-session-1", type: "payment.captured", payload: { amount_paise: 74900, rzp_order_id: "order_demo123" } },
  { id: "evt_9", ts: new Date(Date.now() - 1000 * 60 * 50 * 2).toISOString(), session_id: "demo-session-1", type: "agent.left", payload: { turns: 6 } }
];

for (const e of demoEvents) {
  await db().execute({
    sql: `INSERT INTO events (id, ts, session_id, type, payload_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    args: [e.id, e.ts, e.session_id, e.type, JSON.stringify(e.payload)]
  });
}

// Campaigns — merchant-configurable promotions
const now = new Date();
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

const campaigns = [
  {
    id: "camp-mithai-bundle",
    name: "Mithai Bundle Bonanza",
    description: "Buy 2 or more mithai items and get 15% off the total mithai value",
    kind: "bundle",
    config: { categories: ["mithai"], min_items: 2, discount_percent: 15 },
    starts_at: weekAgo,
    ends_at: monthFromNow,
  },
  {
    id: "camp-chai-flash",
    name: "Chai Flash Sale",
    description: "Masala Chai Kit at ₹299 — limited time Diwali offer (down from ₹349)",
    kind: "flash_sale",
    config: { skus: ["CHAI-MSL-001"], sale_price_paise: 29900 },
    starts_at: weekAgo,
    ends_at: fourHoursFromNow,
  },
  {
    id: "camp-cross-sell",
    name: "Festival Cross-Sell",
    description: "Buy from 2+ different categories and get 10% off your cheapest item",
    kind: "cross_sell",
    config: { min_categories: 2, discount_percent: 10, exclude_categories: ["cricket"] },
    starts_at: weekAgo,
    ends_at: monthFromNow,
  },
  {
    id: "camp-flash-diya",
    name: "Diya Flash Deal",
    description: "Diwali Diya Set at ₹149 — 25% off for the next 5 minutes only!",
    kind: "flash_sale",
    config: { skus: ["DECO-DIYA-009"], sale_price_paise: 14900 },
    starts_at: weekAgo,
    ends_at: fiveMinutesFromNow,
  },
];

for (const c of campaigns) {
  await db().execute({
    sql: `INSERT INTO campaigns (id, name, description, kind, config_json, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
            config_json=excluded.config_json, starts_at=excluded.starts_at, ends_at=excluded.ends_at, enabled=1`,
    args: [c.id, c.name, c.description, c.kind, JSON.stringify(c.config), c.starts_at, c.ends_at],
  });
}

console.log(`seeded ${CATALOG.length} products + ${rules.length} policy rules + ${campaigns.length} campaigns + ${demoEvents.length} historical events`);
