import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import {
  createIntentMandate,
  createCartMandate,
  createPaymentMandate,
  requestCheckout,
  type CheckoutResult,
} from "@/lib/server";
import { reconcileByReference } from "@/lib/razorpay/rail";

/**
 * StoreTools — ONE implementation of "shop at the bazaar", consumed by every
 * front door: REST routes, the MCP server, and each provider harness. A
 * guarantee added here applies to Claude, Gemini and any MCP client alike;
 * there is exactly one place where spending semantics live.
 *
 * Tools are bound to a session at construction time, so agent-facing schemas
 * never carry session ids — fewer arguments, fewer model mistakes.
 */

export type StoreToolName =
  | "search_catalog"
  | "quote_cart"
  | "create_intent_mandate"
  | "propose_cart"
  | "request_checkout"
  | "get_payment_status"
  | "accept_suggestion";

export type ProductView = {
  sku: string;
  title: string;
  description: string;
  category: string;
  price_inr: number;
  price_paise: number;
  in_stock: boolean;
  stock: number;
};

export type SessionContext = {
  sessionId: string;
  agentId: string;
  provider: string;
  persona: string;
};

type DbProduct = {
  id: string; sku: string; title: string; description: string;
  category: string; price_paise: number; stock: number;
};

export function storeTools(session: SessionContext) {
  return {
    /** Search the bazaar. Query matches title/description/category loosely. */
    async search_catalog(input: { query?: string; category?: string }): Promise<{ items: ProductView[] }> {
      let sql = `SELECT id, sku, title, description, category, price_paise, stock FROM products WHERE stock >= 0`;
      const args: (string | number)[] = [];
      if (input.category) {
        sql += ` AND category = ?`;
        args.push(input.category);
      }
      const res = await db().execute({ sql: `${sql} ORDER BY category, title`, args });
      let items = res.rows.map((r) => ({
        sku: String(r.sku),
        title: String(r.title),
        description: String(r.description),
        category: String(r.category),
        price_paise: Number(r.price_paise),
        price_inr: Number(r.price_paise) / 100,
        stock: Number(r.stock),
        in_stock: Number(r.stock) > 0,
      })) as ProductView[];

      if (input.query) {
        const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
        items = items.filter((p) => {
          const hay = `${p.title} ${p.description} ${p.category}`.toLowerCase();
          return terms.some((t) => hay.includes(t));
        });
      }
      await publish({
        type: "agent.searched_catalog",
        session_id: session.sessionId,
        payload: { query: input.query ?? null, results: items.length },
      });
      return { items };
    },

    /**
     * Read-only price/stock check BEFORE committing to a cart mandate.
     * Lets an agent self-correct without burning signature steps.
     */
    async quote_cart(input: { items: { sku: string; qty: number }[] }) {
      const lines: { sku: string; title: string; qty: number; unit_price_paise: number; line_total_paise: number }[] = [];
      const problems: Record<string, unknown>[] = [];
      for (const item of input.items ?? []) {
        const res = await db().execute({ sql: "SELECT * FROM products WHERE sku = ?", args: [item.sku] });
        const p = res.rows[0] as unknown as DbProduct | undefined;
        if (!p) {
          problems.push({ problem: "unknown_sku", sku: item.sku });
          continue;
        }
        if (!Number.isInteger(item.qty) || item.qty <= 0) {
          problems.push({ problem: "bad_qty", sku: item.sku, qty: item.qty });
          continue;
        }
        if (p.stock < item.qty) {
          problems.push({ problem: "insufficient_stock", sku: item.sku, requested: item.qty, available: p.stock });
          continue;
        }
        lines.push({ sku: p.sku, title: p.title, qty: item.qty, unit_price_paise: p.price_paise, line_total_paise: p.price_paise * item.qty });
      }
      return {
        lines,
        problems,
        quotable: problems.length === 0 && lines.length > 0,
        total_paise: lines.reduce((s, l) => s + l.line_total_paise, 0),
      };
    },

    /** Step 1 of buying: record what the user authorizes, and its bounds. */
    async create_intent_mandate(input: { max_amount_paise: number; categories?: string[]; note?: string }) {
      const m = await createIntentMandate(session.sessionId, {
        max_amount_paise: Number(input.max_amount_paise),
        categories: input.categories,
        note: input.note,
      });
      return {
        intent_mandate_id: m.id,
        signed_by: m.signed_by,
        expires_at: new Date(m.exp * 1000).toISOString(),
        note: "Bounds recorded and signed by the user. Carts must stay within them.",
      };
    },

    /**
     * Step 2: commit to an exact cart (signed by the agent). Structured 409-style
     * errors come back as data so the agent can correct and retry.
     */
    async propose_cart(input: { intent_mandate_id: string; items: { sku: string; qty: number }[] }) {
      const result = await createCartMandate(session.sessionId, input.intent_mandate_id, input.items ?? []);
      if (!result.ok) return { ok: false as const, reason: result.reason, detail: result.detail };
      return {
        ok: true as const,
        cart_mandate_id: result.mandate.id,
        total_paise: result.total_paise,
        note: "Cart signed by the agent and hash-linked to the user's intent.",
      };
    },

    /**
     * Step 3: checkout. Creates + signs the PAYMENT mandate (merchant), runs
     * the policy gate, and on allow issues real test-mode rails. This single
     * call is deliberately the ONLY way money ever moves.
     */
    async request_checkout(input: { cart_mandate_id: string }): Promise<CheckoutResult & { guidance?: string }> {
      // get_payment_status-driven flows need the payment row id, so keep the
      // association discoverable: the mandate chain is the key.
      const paymentMandate = await createPaymentMandate(session.sessionId, input.cart_mandate_id);
      const result = await requestCheckout(paymentMandate.id);

      const guidance =
        result.status === "issued"
          ? "Rails issued. Complete/settle via the hosted Razorpay page, then check get_payment_status."
          : result.status === "needs_approval"
            ? "A policy rule tripped. The shopkeeper must approve — call get_payment_status periodically."
            : result.status === "denied"
              ? "Denied by policy. Do NOT retry the same cart; adjust within the stated reasons."
              : undefined;
      return { ...result, guidance };
    },

    /**
     * Ground truth of where the money stands, straight from the ledger.
     * Triggers the poll reconciler when webhooks have been quiet.
     */
    async get_payment_status(input: { payment_row_id?: string; cart_mandate_id?: string }) {
      let rowId = input.payment_row_id;
      if (!rowId && input.cart_mandate_id) {
        const pmRes = await db().execute({
          sql: `SELECT id FROM mandates
                WHERE json_extract(payload_json,'$.cart_mandate_id') = ? AND type='PAYMENT'
                ORDER BY iat DESC, rowid DESC LIMIT 1`,
          args: [input.cart_mandate_id],
        });
        rowId = pmRes.rows[0] ? String(pmRes.rows[0].id) : undefined;
      }
      if (!rowId) return { error: "provide payment_row_id or cart_mandate_id" };

      const res = await db().execute({ sql: "SELECT * FROM payments WHERE id = ?", args: [rowId] });
      const row = res.rows[0] as unknown as
        | { id: string; mandate_id: string; amount_paise: number; attempt: number; status: string; failure_reason: string | null; reference_id: string | null }
        | undefined;
      if (!row) return { error: "unknown payment_row_id" };

      if (row.status === "checkout_open") {
        await reconcileByReference(row.id); // webhook may be slow; ask the rail directly
        const fresh = await db().execute({ sql: "SELECT status, rzp_payment_id FROM payments WHERE id = ?", args: [row.id] });
        row.status = String(fresh.rows[0]?.status ?? row.status);
      }

      // Is a human still holding the pen on this purchase?
      const pending = await db().execute({
        sql: "SELECT id, requested_at FROM approvals WHERE mandate_id = ? AND outcome IS NULL",
        args: [row.mandate_id],
      });

      return {
        payment_row_id: row.id,
        attempt: row.attempt,
        status: row.status,
        amount_paise: row.amount_paise,
        failure_reason: row.failure_reason,
        waiting_for_human: pending.rows.length > 0,
        note:
          row.status === "failed"
            ? "This attempt failed. You may request_checkout again on the same cart — a fresh attempt will be recorded."
            : row.status === "captured" || row.status === "recovered"
              ? "Payment complete. Receipt is in the audit trail."
              : undefined,
      };
    },

    /** Records that the agent acted on a merchant suggestion — upsell evidence. */
    async accept_suggestion(input: { suggestion_id: string }) {
      await db().execute({
        sql: "UPDATE suggestions SET accepted = 1 WHERE id = ? AND accepted IS NULL",
        args: [input.suggestion_id],
      });
      await publish({
        type: "suggestion.accepted",
        session_id: session.sessionId,
        payload: { suggestion_id: input.suggestion_id },
      });
      return { accepted: true };
    },
  };
}

/** JSON-schema descriptions for function-calling surfaces (harness + MCP share these). */
export const TOOL_SCHEMAS: Record<StoreToolName, { description: string; parameters: object }> = {
  search_catalog: {
    description: "Search the bazaar catalog. Optional free-text query and/or category filter.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "free-text search across titles and descriptions" },
        category: { type: "string", description: "exact category filter, e.g. mithai, chai, decor" },
      },
    },
  },
  quote_cart: {
    description: "Check prices, stock and problems for a candidate cart WITHOUT committing.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, qty: { type: "integer" } },
            required: ["sku", "qty"],
          },
        },
      },
      required: ["items"],
    },
  },
  create_intent_mandate: {
    description:
      "Record the USER'S authorization bounds before any purchase: maximum spend in paise (₹1 = 100 paise) and allowed categories. Signed cryptographically.",
    parameters: {
      type: "object",
      properties: {
        max_amount_paise: { type: "integer", description: "maximum total spend in paise" },
        categories: { type: "array", items: { type: "string" }, description: "if given, carts may contain only these categories" },
        note: { type: "string", description: "free-text purpose, e.g. 'Diwali gifts for family'" },
      },
      required: ["max_amount_paise"],
    },
  },
  propose_cart: {
    description: "Commit to an exact cart under a signed intent. Returns structured errors if the cart violates stock, price or intent bounds.",
    parameters: {
      type: "object",
      properties: {
        intent_mandate_id: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, qty: { type: "integer" } },
            required: ["sku", "qty"],
          },
        },
      },
      required: ["intent_mandate_id", "items"],
    },
  },
  request_checkout: {
    description:
      "Attempt payment for a signed cart. Runs the merchant's policy engine: may complete instantly, require human approval, or be denied with reasons. THE ONLY WAY MONEY MOVES.",
    parameters: {
      type: "object",
      properties: { cart_mandate_id: { type: "string" } },
      required: ["cart_mandate_id"],
    },
  },
  get_payment_status: {
    description: "Ground-truth status of a payment attempt from the ledger (including whether a human approval is pending).",
    parameters: {
      type: "object",
      properties: {
        payment_row_id: { type: "string" },
        cart_mandate_id: { type: "string", description: "alternative: latest payment for this cart" },
      },
    },
  },
  accept_suggestion: {
    description: "Record acceptance of a merchant suggestion (upsell).",
    parameters: {
      type: "object",
      properties: { suggestion_id: { type: "string" } },
      required: ["suggestion_id"],
    },
  },
};
