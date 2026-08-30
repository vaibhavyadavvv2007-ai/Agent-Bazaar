import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { issueRailForMandate } from "@/lib/server";
import { publishCheckoutConversational, listOpenCheckouts } from "@/lib/checkout/conversational";

export const dynamic = "force-dynamic";

/**
 * The shopkeeper's bell.
 *
 * GET  → open approvals with full context (amount, reasons, chain ids)
 * POST { approval_id, decision: "approved" | "rejected", decided_by? }
 *        approved → rail issuance proceeds for the parked mandate
 *        rejected → the agent receives a structured human refusal
 */
export async function GET(req: NextRequest) {
  const res = await db().execute(`
    SELECT a.id, a.mandate_id, a.reason, a.requested_at,
           m.session_id, m.hash AS payment_hash,
           json_extract(m.payload_json, '$.cart_mandate_id') AS cart_mandate_id,
           json_extract(m.payload_json, '$.amount_paise')    AS amount_paise
    FROM approvals a
    JOIN mandates m ON m.id = a.mandate_id
    WHERE a.outcome IS NULL
    ORDER BY a.requested_at ASC
  `);

  const queue = res.rows.map((r) => ({
    id: String(r.id),
    mandate_id: String(r.mandate_id),
    session_id: String(r.session_id),
    amount_paise: Number(r.amount_paise ?? 0),
    cart_mandate_id: r.cart_mandate_id ? String(r.cart_mandate_id) : null,
    reasons: safeParse(String(r.reason)),
    requested_at: String(r.requested_at),
  }));

  // Checkouts that issued (gate approved) but are still unpaid — the shopkeeper
  // needs a checkout button for these even if the approval happened elsewhere.
  const open_checkouts = await listOpenCheckouts(req.nextUrl.origin);

  // Decisions made today — the queue's "completed" counter (UTC-day boundary,
  // honest for synthetic traffic).
  const decided = await db().execute(`
    SELECT outcome, COUNT(*) AS n
    FROM approvals
    WHERE decided_at IS NOT NULL AND date(decided_at) = date('now')
    GROUP BY outcome
  `);
  const decided_today = {
    approved: Number(decided.rows.find((r) => String(r.outcome) === "approved")?.n ?? 0),
    rejected: Number(decided.rows.find((r) => String(r.outcome) === "rejected")?.n ?? 0),
  };

  return NextResponse.json(
    { count: queue.length, queue, open_checkouts, decided_today },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

type DecisionBody = { approval_id?: string; decision?: "approved" | "rejected"; decided_by?: string };

export async function POST(req: NextRequest) {
  let body: DecisionBody;
  try {
    body = (await req.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.approval_id || !body.decision || !["approved", "rejected"].includes(body.decision)) {
    return NextResponse.json({ error: "approval_id and decision (approved|rejected) required" }, { status: 400 });
  }

  const res = await db().execute({
    sql: "SELECT id, mandate_id FROM approvals WHERE id = ? AND outcome IS NULL",
    args: [body.approval_id],
  });
  const row = res.rows[0];
  if (!row) return NextResponse.json({ error: "approval not found or already decided" }, { status: 404 });

  await db().execute({
    sql: `UPDATE approvals SET outcome = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?`,
    args: [body.decision, body.decided_by ?? "shopkeeper", body.approval_id],
  });

  const sessionIdRes = await db().execute({
    sql: "SELECT session_id FROM mandates WHERE id = ?",
    args: [String(row.mandate_id)],
  });
  const sessionId = (sessionIdRes.rows[0]?.session_id as string | undefined) ?? null;

  await publish({
    type: `approval.${body.decision}`,
    session_id: sessionId,
    payload: { approval_id: body.approval_id, mandate_id: String(row.mandate_id), decided_by: body.decided_by ?? "shopkeeper" },
  });

  if (body.decision === "approved") {
    // Human consent recorded — the gate opens and the rail issues.
    // NOTE: issueRailForMandate's signature is (mandateId, sessionId, origin) —
    // the request origin must go in the THIRD slot or the checkout URL falls
    // back to env vars / localhost.
    const result = await issueRailForMandate(String(row.mandate_id), undefined, req.nextUrl.origin);

    // The bazaar-floor checkout modal (the pay button) opens ONLY on this
    // event — the immediate-issue path publishes it inside request_checkout.
    // Gated carts (> policy limit) must fire it here too, or the shopkeeper
    // approves a cart nobody can ever pay for.
    if (result.status === "issued" && result.payment_row_id) {
      const payRes = await db().execute({
        sql: "SELECT rzp_order_id FROM payments WHERE id = ?",
        args: [result.payment_row_id],
      });
      try {
        await publishCheckoutConversational({
          paymentMandateId: String(row.mandate_id),
          paymentRowId: result.payment_row_id,
          rzpOrderId: String(payRes.rows[0]?.rzp_order_id ?? ""),
          amountPaise: result.amount_paise,
        });
      } catch (e) {
        // Event publish must never fail the approval itself.
        console.error("[approvals] conversational checkout event failed:", e);
      }
    }

    return NextResponse.json({ decision: "approved", rail: result }, { status: result.status === "issued" ? 200 : 500 });
  }

  return NextResponse.json({ decision: "rejected", note: "agent will receive a structured refusal on its next status check" });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
