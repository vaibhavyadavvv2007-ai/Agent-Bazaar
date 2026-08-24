import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { canonicalJson, canonicalHash } from "./canonical";
import { signMandate, verifyMandate, type Actor } from "./sign";
import { evaluate, type PolicyRule, type SpendContext, type RuleHit } from "@/lib/policy/engine";
import { publish } from "@/lib/events/bus";

/**
 * The mandate pipeline — the one road every purchase drives down.
 *
 *   INTENT (signed by user)  →  CART (signed by agent)  →  PAYMENT (signed by merchant)
 *        "what & bounds"          "exactly what"              "at this price"
 *
 * followed by the policy gate and, when allowed, issuance on real test-mode rails.
 *
 * Immutability note: mandate rows are NEVER updated after insert — not even
 * for status. Their truth is fixed at signing; everything that happens next
 * lives in `policy_decisions`, `approvals`, `payments` and the `events` trail.
 * That is what makes the audit log trustworthy: rewriting history requires
 * deleting rows, and the schema forbids exactly that.
 */

export const TTL = { INTENT: 15 * 60, CART: 10 * 60, PAYMENT: 10 * 60 }; // seconds

export type IntentInput = {
  max_amount_paise: number;
  /** If non-empty, carts may contain only these categories. */
  categories?: string[];
  note?: string;
};

export type CartItemInput = { sku: string; qty: number };

export type MandateRow = {
  id: string;
  session_id: string;
  type: "INTENT" | "CART" | "PAYMENT";
  parent_hash: string | null;
  payload_json: string;
  hash: string;
  signed_by: Actor;
  sig: string;
  alg: string;
  status: string;
  iat: number;
  exp: number;
};

type ProductRow = {
  id: string; sku: string; title: string; category: string;
  price_paise: number; stock: number;
};

async function insertMandate(
  sessionId: string,
  type: MandateRow["type"],
  actor: Actor,
  payload: Record<string, unknown>,
  parentHash: string | null,
  ttlSeconds: number
): Promise<MandateRow> {
  const now = Math.floor(Date.now() / 1000);
  const payloadWithTime = { ...payload, iat: now, exp: now + ttlSeconds };
  const canonical = canonicalJson(payloadWithTime);
  const hash = canonicalHash(payloadWithTime);
  const sig = await signMandate(actor, canonical);

  const row: MandateRow = {
    id: randomUUID(),
    session_id: sessionId,
    type,
    parent_hash: parentHash,
    payload_json: canonical,
    hash,
    signed_by: actor,
    sig,
    alg: "ed25519",
    status: "signed",
    iat: now,
    exp: now + ttlSeconds,
  };

  await db().execute({
    sql: `INSERT INTO mandates (id, session_id, type, parent_hash, payload_json, hash, signed_by, sig, alg, status, iat, exp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [row.id, row.session_id, row.type, row.parent_hash, row.payload_json, row.hash,
           row.signed_by, row.sig, row.alg, row.status, row.iat, row.exp],
  });

  await publish({ type: `mandate.signed.${type.toLowerCase()}`, session_id: sessionId,
                  payload: { mandate_id: row.id, hash: row.hash, signed_by: actor } });
  return row;
}

export async function getMandate(id: string): Promise<MandateRow | null> {
  const res = await db().execute({ sql: "SELECT * FROM mandates WHERE id = ?", args: [id] });
  return (res.rows[0] as unknown as MandateRow) ?? null;
}

/* ── Step 1: INTENT ──────────────────────────────────────────────────── */

export async function createIntentMandate(sessionId: string, input: IntentInput): Promise<MandateRow> {
  if (!Number.isInteger(input.max_amount_paise) || input.max_amount_paise <= 0) {
    throw new PipelineError("max_amount_paise must be a positive integer (paise)");
  }
  return insertMandate(sessionId, "INTENT", "user", {
    type: "INTENT",
    session_id: sessionId,
    max_amount_paise: input.max_amount_paise,
    categories: input.categories ?? [],
    note: input.note ?? "",
  }, null, TTL.INTENT);
}

/* ── Step 2: CART ────────────────────────────────────────────────────── */

export type CartBuildResult =
  | { ok: true; mandate: MandateRow; total_paise: number }
  | { ok: false; reason: string; detail: Record<string, unknown> };

export async function createCartMandate(
  sessionId: string,
  intentMandateId: string,
  items: CartItemInput[]
): Promise<CartBuildResult> {
  const intent = await getMandate(intentMandateId);
  if (!intent || intent.type !== "INTENT") throw new PipelineError("unknown intent mandate");
  assertFresh(intent);
  const intentPayload = JSON.parse(intent.payload_json) as {
    max_amount_paise: number; categories: string[];
  };

  if (items.length === 0) throw new PipelineError("cart is empty");

  // Price/stock are validated against the database AT THIS INSTANT — the cart
  // mandate freezes them, so later drift invalidates rather than surprises.
  const skus = [...new Set(items.map((i) => i.sku))];
  const placeholders = skus.map(() => "?").join(",");
  const found = (await db().execute({
    sql: `SELECT id, sku, title, category, price_paise, stock FROM products WHERE sku IN (${placeholders})`,
    args: skus,
  })).rows as unknown as ProductRow[];
  const bySku = new Map(found.map((p) => [p.sku, p]));

  const lineItems: { sku: string; title: string; qty: number; unit_price_paise: number }[] = [];
  const categories = new Set<string>();

  for (const item of items) {
    const product = bySku.get(item.sku);
    if (!product) return { ok: false, reason: "unknown_sku", detail: { sku: item.sku } };
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      return { ok: false, reason: "bad_qty", detail: { sku: item.sku, qty: item.qty } };
    }
    if (product.stock < item.qty) {
      return { ok: false, reason: "insufficient_stock", detail: { sku: item.sku, requested: item.qty, available: product.stock } };
    }
    lineItems.push({ sku: product.sku, title: product.title, qty: item.qty, unit_price_paise: product.price_paise });
    categories.add(product.category);
  }

  const total = lineItems.reduce((s, li) => s + li.qty * li.unit_price_paise, 0);

  // The intent's bounds bind the cart. This is AP2's raison d'être.
  if (total > intentPayload.max_amount_paise) {
    return { ok: false, reason: "exceeds_intent_bound",
             detail: { total_paise: total, max_allowed_paise: intentPayload.max_amount_paise } };
  }
  const allowedCategories = intentPayload.categories ?? [];
  if (allowedCategories.length > 0 && ![...categories].every((c) => allowedCategories.includes(c))) {
    return { ok: false, reason: "category_outside_intent",
             detail: { cart_categories: [...categories], allowed_categories: allowedCategories } };
  }

  const mandate = await insertMandate(sessionId, "CART", "agent", {
    type: "CART",
    session_id: sessionId,
    intent_mandate_id: intentMandateId,
    items: lineItems,
    total_paise: total,
    categories: [...categories].sort(),
  }, intent.hash, TTL.CART);

  return { ok: true, mandate, total_paise: total };
}

/* ── Step 3: PAYMENT ─────────────────────────────────────────────────── */

export async function createPaymentMandate(sessionId: string, cartMandateId: string): Promise<MandateRow> {
  const cart = await getMandate(cartMandateId);
  if (!cart || cart.type !== "CART") throw new PipelineError("unknown cart mandate");
  assertFresh(cart);
  const payload = JSON.parse(cart.payload_json) as { total_paise: number };

  return insertMandate(sessionId, "PAYMENT", "merchant", {
    type: "PAYMENT",
    session_id: sessionId,
    cart_mandate_id: cartMandateId,
    amount_paise: payload.total_paise,
  }, cart.hash, TTL.PAYMENT);
}

/* ── Chain verification ─────────────────────────────────────────────── */

export type ChainCheck = { mandate_id: string; step: string; ok: boolean; detail?: string };

export async function verifyChain(intentId: string, cartId: string, paymentId: string): Promise<{ ok: boolean; checks: ChainCheck[] }> {
  const checks: ChainCheck[] = [];
  const push = (mandate_id: string, step: string, ok: boolean, detail?: string) =>
    checks.push({ mandate_id, step, ok, detail });

  const intent = await getMandate(intentId);
  const cart = await getMandate(cartId);
  const payment = await getMandate(paymentId);
  if (!intent || !cart || !payment) {
    return { ok: false, checks: [{ mandate_id: `${intentId}/${cartId}/${paymentId}`, step: "existence", ok: false }] };
  }

  const pairs: [MandateRow, Actor][] = [[intent, "user"], [cart, "agent"], [payment, "merchant"]];

  for (const [m, actor] of pairs) {
    // Payload integrity: stored canonical text must re-hash to the stored hash.
    push(m.id, "hash_matches_payload", canonicalHash(JSON.parse(m.payload_json)) === m.hash);
    // Signature must verify under the signing actor's key.
    push(m.id, `signature_valid_${m.signed_by}`, await verifyMandate(m.signed_by, m.payload_json, m.sig));
    // Freshness.
    push(m.id, "not_expired", m.exp > Math.floor(Date.now() / 1000), `exp=${m.exp}`);
  }

  // Hash linkage: each child must name its parent's exact hash.
  push(cart.id, "linked_to_intent", cart.parent_hash === intent.hash);
  push(payment.id, "linked_to_cart", payment.parent_hash === cart.hash);
  // Type ordering.
  push(cart.id, "intent_is_parent_type", (JSON.parse(cart.payload_json) as { intent_mandate_id: string }).intent_mandate_id === intent.id);
  push(payment.id, "cart_is_parent_type", (JSON.parse(payment.payload_json) as { cart_mandate_id: string }).cart_mandate_id === cart.id);

  return { ok: checks.every((c) => c.ok), checks };
}

/* ── Checkout gate ──────────────────────────────────────────────────── */

export type CheckoutResult =
  | { status: "issued"; payment_row_id: string; checkout_url: string; amount_paise: number; verdict: { outcome: string; reasons: RuleHit[] } }
  | { status: "needs_approval"; approval_id: string; reasons: RuleHit[]; amount_paise: number }
  | { status: "denied"; reasons: RuleHit[]; amount_paise: number }
  | { status: "rejected"; reason: string; detail: Record<string, unknown> };

/** Runs the full gate for a signed PAYMENT mandate. */
export async function requestCheckout(paymentMandateId: string): Promise<CheckoutResult> {
  const payment = await getMandate(paymentMandateId);
  if (!payment || payment.type !== "PAYMENT") {
    return { status: "rejected", reason: "unknown_payment_mandate", detail: {} };
  }

  const payload = JSON.parse(payment.payload_json) as { cart_mandate_id: string };
  const chain = await verifyChain(
    await grandparentOf(payment),
    payload.cart_mandate_id,
    paymentMandateId
  );
  if (!chain.ok) {
    await publish({ type: "checkout.chain_invalid", session_id: payment.session_id,
                    payload: { mandate_id: paymentMandateId, checks: chain.checks } });
    return { status: "rejected", reason: "mandate_chain_invalid", detail: { checks: chain.checks } };
  }

  const rulesRes = await db().execute("SELECT id, agent_id, kind, config_json, enabled FROM policy_rules WHERE enabled = 1");
  const rules: PolicyRule[] = rulesRes.rows.map((r) => ({
    id: String(r.id),
    agent_id: (r.agent_id as string | null) ?? null,
    kind: r.kind as PolicyRule["kind"],
    enabled: true,
    config: JSON.parse(String(r.config_json)),
  }));

  const sessionRes = await db().execute({ sql: "SELECT agent_id FROM sessions WHERE id = ?", args: [payment.session_id] });
  const agentId = String(sessionRes.rows[0]?.agent_id ?? "unknown");

  const cartPayload = JSON.parse((await getMandate(payload.cart_mandate_id))!.payload_json) as { total_paise: number; categories: string[] };
  const ctx: SpendContext = {
    agent_id: agentId,
    ...(await spendContext(agentId)),
    cart_total_paise: cartPayload.total_paise,
    cart_categories: cartPayload.categories,
  };

  const verdict = evaluate(rules, ctx);

  await db().execute({
    sql: "INSERT INTO policy_decisions (id, mandate_id, verdict, reasons_json) VALUES (?, ?, ?, ?)",
    args: [randomUUID(), paymentMandateId, verdict.outcome, JSON.stringify(verdict.reasons)],
  });
  await publish({ type: `policy.${verdict.outcome}`, session_id: payment.session_id,
                  payload: { mandate_id: paymentMandateId, amount_paise: cartPayload.total_paise,
                             outcome: verdict.outcome, reasons: verdict.reasons } });

  if (verdict.outcome === "deny") {
    return { status: "denied", reasons: verdict.reasons, amount_paise: cartPayload.total_paise };
  }

  if (verdict.outcome === "gate") {
    const approvalId = randomUUID();
    await db().execute({
      sql: "INSERT INTO approvals (id, mandate_id, reason) VALUES (?, ?, ?)",
      args: [approvalId, paymentMandateId, JSON.stringify(verdict.reasons)],
    });
    await publish({ type: "approval.requested", session_id: payment.session_id,
                    payload: { approval_id: approvalId, mandate_id: paymentMandateId,
                               amount_paise: cartPayload.total_paise, reasons: verdict.reasons } });
    return { status: "needs_approval", approval_id: approvalId, reasons: verdict.reasons, amount_paise: cartPayload.total_paise };
  }

  return issueRail(paymentMandateId, payment.session_id);
}

async function grandparentOf(payment: MandateRow): Promise<string> {
  const cartPayload = JSON.parse(payment.payload_json) as { cart_mandate_id: string };
  const cart = await getMandate(cartPayload.cart_mandate_id);
  const intentPayload = cart ? (JSON.parse(cart.payload_json) as { intent_mandate_id: string }) : { intent_mandate_id: "" };
  return intentPayload.intent_mandate_id;
}

async function spendContext(agentId: string): Promise<{ spent_today_paise: number; txns_in_window: number }> {
  const spent = await db().execute({
    sql: `SELECT COALESCE(SUM(p.amount_paise), 0) AS total
          FROM payments p
          JOIN mandates m ON m.id = p.mandate_id
          JOIN sessions s ON s.id = m.session_id
          WHERE s.agent_id = ? AND p.status NOT IN ('failed', 'cancelled')
            AND date(p.created_at) = date('now')`,
    args: [agentId],
  });
  const txns = await db().execute({
    sql: `SELECT COUNT(*) AS n
          FROM payments p
          JOIN mandates m ON m.id = p.mandate_id
          JOIN sessions s ON s.id = m.session_id
          WHERE s.agent_id = ? AND p.status NOT IN ('failed', 'cancelled')
            AND p.created_at >= datetime('now', '-60 minutes')`,
    args: [agentId],
  });
  return {
    spent_today_paise: Number(spent.rows[0]?.total ?? 0),
    txns_in_window: Number(txns.rows[0]?.n ?? 0),
  };
}

function assertFresh(m: MandateRow): void {
  if (m.exp <= Math.floor(Date.now() / 1000)) throw new PipelineError(`mandate ${m.id} expired`);
}

/** Issued lazily by the rail module to avoid a circular dependency. */
let _issueRailImpl: ((paymentMandateId: string, sessionId: string) => Promise<CheckoutResult>) | null = null;
export function registerIssueRail(fn: typeof _issueRailImpl): void { _issueRailImpl = fn; }
function issueRail(paymentMandateId: string, sessionId: string): Promise<CheckoutResult> {
  if (!_issueRailImpl) throw new PipelineError("rail not registered — did the server boot lib/razorpay/rail.ts?");
  return _issueRailImpl(paymentMandateId, sessionId);
}

export class PipelineError extends Error {}
