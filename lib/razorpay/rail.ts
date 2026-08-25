import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { getMandate, registerIssueRail, type CheckoutResult } from "@/lib/mandates/pipeline";
import { createOrder, createPaymentLink } from "./client";

/**
 * The settlement rail: turns an approved PAYMENT mandate into a real Razorpay
 * test-mode order + payment link, and records what the rail says back.
 *
 * Self-registers into the pipeline on import — every server entry point that
 * can trigger checkout imports this module (directly or via lib/server.ts).
 */

type PaymentRow = {
  id: string;
  mandate_id: string;
  reference_id: string | null;
  rzp_order_id: string | null;
  rzp_link_id: string | null;
  rzp_payment_id: string | null;
  amount_paise: number;
  attempt: number;
  status: string;
};

export async function issueRailForMandate(paymentMandateId: string, _sessionId?: string, origin?: string): Promise<CheckoutResult> {
  const mandate = await getMandate(paymentMandateId);
  if (!mandate || mandate.type !== "PAYMENT") {
    return { status: "rejected", reason: "unknown_payment_mandate", detail: {} };
  }
  const payload = JSON.parse(mandate.payload_json) as { amount_paise: number; session_id: string };

  // Retry semantics: each attempt is a NEW payments row (append-friendly);
  // earlier failed attempts stay as history.
  const existing = await db().execute({
    sql: "SELECT COALESCE(MAX(attempt), 0) AS n FROM payments WHERE mandate_id = ?",
    args: [paymentMandateId],
  });
  const attempt = Number(existing.rows[0]?.n ?? 0) + 1;

  const paymentRowId = randomUUID();

  const order = await createOrder({
    amount_paise: payload.amount_paise,
    receipt: paymentRowId,
    notes: { mandate_id: paymentMandateId, session_id: payload.session_id },
  });

  // Primary rail: Razorpay Checkout Standard rendered on OUR storefront page
  // (app/checkout/[rowId]) — the authentic merchant integration. Contact is
  // prefilled, so the hosted flow is: pick UPI → enter VPA → pay.
  // (Payment Links remain in lib/razorpay/client.ts as a no-code fallback.)
  const appUrl = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutUrl = `${appUrl}/checkout/${paymentRowId}`;

  await db().execute({
    sql: `INSERT INTO payments (id, mandate_id, reference_id, rzp_order_id, amount_paise, attempt, status)
          VALUES (?, ?, ?, ?, ?, ?, 'checkout_open')`,
    args: [paymentRowId, paymentMandateId, paymentRowId, order.id, payload.amount_paise, attempt],
  });

  await publish({
    type: "payment.checkout_open",
    session_id: payload.session_id,
    payload: {
      payment_row_id: paymentRowId,
      mandate_id: paymentMandateId,
      attempt,
      amount_paise: payload.amount_paise,
      rzp_order_id: order.id,
      checkout_url: checkoutUrl,
    },
  });

  return {
    status: "issued",
    payment_row_id: paymentRowId,
    checkout_url: checkoutUrl,
    amount_paise: payload.amount_paise,
    verdict: { outcome: "allow", reasons: [] },
  };
}

// Wire the implementation into the pipeline (no circular import).
registerIssueRail(issueRailForMandate);

/* ── Settlement truth ────────────────────────────────────────────────── */

export type SettlementInput = {
  /** Any of these ids may appear in a webhook; we match what we have. */
  reference_id?: string | null;
  rzp_order_id?: string | null;
  rzp_payment_id?: string | null;
  rzp_link_id?: string | null;
};
export type SettlementOutcome = "captured" | "failed";

/**
 * Apply a terminal settlement to the payments ledger. Idempotent: replaying
 * the same webhook changes nothing beyond a recorded duplicate event.
 * Returns the affected row, or null if nothing matched.
 */
export async function applySettlement(
  outcome: SettlementOutcome,
  ids: SettlementInput,
  extra: { failure_reason?: string; raw: unknown }
): Promise<PaymentRow | null> {
  const row = await findPaymentRow(ids);
  if (!row) return null;

  // Idempotency: already terminal → record duplicate event only.
  if (["captured", "recovered"].includes(row.status) && outcome === "captured") {
    await publish({ type: "payment.duplicate_webhook", payload: { payment_row_id: row.id, outcome } });
    return row;
  }

  const newStatus = outcome === "captured" ? "captured" : "failed";
  await db().execute({
    sql: `UPDATE payments SET status = ?, rzp_payment_id = COALESCE(?, rzp_payment_id),
            failure_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [newStatus, ids.rzp_payment_id ?? null, extra.failure_reason ?? null, row.id],
  });

  const sessionRes = await db().execute({ sql: "SELECT session_id FROM mandates WHERE id = ?", args: [row.mandate_id] });
  const sessionId = (sessionRes.rows[0]?.session_id as string | undefined) ?? null;

  await publish({
    type: `payment.${newStatus}`,
    session_id: sessionId,
    payload: {
      payment_row_id: row.id,
      mandate_id: row.mandate_id,
      attempt: row.attempt,
      amount_paise: row.amount_paise,
      failure_reason: extra.failure_reason ?? null,
    },
  });

  // Recovery bookkeeping: when a capture lands, any FAILED attempts for the
  // SAME CART (earlier payment mandates included — retries sign a fresh
  // mandate) become 'recovered'. That is the metric that shows money saved.
  if (outcome === "captured") {
    const payloadRes = await db().execute({
      sql: "SELECT payload_json FROM mandates WHERE id = ?",
      args: [row.mandate_id],
    });
    const cartMandateId = (() => {
      try {
        return (JSON.parse(String(payloadRes.rows[0]?.payload_json ?? "{}")) as { cart_mandate_id?: string }).cart_mandate_id ?? null;
      } catch {
        return null;
      }
    })();

    if (cartMandateId) {
      const upd = await db().execute({
        sql: `UPDATE payments SET status = 'recovered', updated_at = datetime('now')
              WHERE status = 'failed' AND mandate_id IN (
                SELECT id FROM mandates
                WHERE type = 'PAYMENT'
                  AND json_extract(payload_json, '$.cart_mandate_id') = ?
              )`,
        args: [cartMandateId],
      });
      if (Number(upd.rowsAffected) > 0 || row.attempt > 1) {
        await publish({
          type: "payment.recovered",
          session_id: sessionId,
          payload: { payment_row_id: row.id, mandate_id: row.mandate_id, prior_failures_marked: Number(upd.rowsAffected) },
        });
      }
    }
  }

  return { ...row, status: newStatus };
}

async function findPaymentRow(ids: SettlementInput): Promise<PaymentRow | null> {
  const candidates = [ids.reference_id, ids.rzp_order_id, ids.rzp_link_id].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const res = await db().execute({
      sql: `SELECT * FROM payments WHERE id = ? OR reference_id = ? OR rzp_order_id = ? OR rzp_link_id = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: [candidate, candidate, candidate, candidate],
    });
    if (res.rows[0]) return res.rows[0] as unknown as PaymentRow;
  }
  return null;
}

/** Poll reconciler — source of truth when webhooks are slow or lost. */
export async function reconcileByReference(referenceOrRowId: string): Promise<PaymentRow | null> {
  const res = await db().execute({
    sql: "SELECT * FROM payments WHERE id = ? OR reference_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [referenceOrRowId, referenceOrRowId],
  });
  const row = res.rows[0] as unknown as PaymentRow | undefined;
  if (!row) return null;
  if (["captured", "recovered", "cancelled"].includes(row.status)) return row;

  // Ask the ORDER what happened — payments made against it appear here with
  // their razorpay payment id, which we then persist.
  const { fetchOrderPayments } = await import("./client");
  const payments = row.rzp_order_id ? await fetchOrderPayments(row.rzp_order_id) : [];
  const terminal = payments.find((p) => p.status === "captured") ?? payments.find((p) => p.status === "failed");
  if (terminal) {
    return applySettlement(
      terminal.status === "captured" ? "captured" : "failed",
      { reference_id: row.reference_id, rzp_order_id: row.rzp_order_id, rzp_payment_id: terminal.id },
      { failure_reason: terminal.error_description ?? null, raw: { via: "poll", payment: terminal } }
    );
  }
  return row;
}
