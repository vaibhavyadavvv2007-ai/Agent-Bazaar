import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reconcileByReference } from "@/lib/razorpay/rail";

export const dynamic = "force-dynamic";

/**
 * GET /api/status?payment_row_id=…  (or ?cart_mandate_id=… → latest attempt)
 *
 * Ground-truth payment status straight from the ledger. When webhooks have
 * been quiet this triggers the poll reconciler — the rail itself is asked,
 * so the answer is never stale.
 */
export async function GET(req: NextRequest) {
  const rowId = req.nextUrl.searchParams.get("payment_row_id");
  const cartId = req.nextUrl.searchParams.get("cart_mandate_id");

  let target = rowId;
  if (!target && cartId) {
    // rowid tiebreaks same-second retries (created_at has second granularity).
    const res = await db().execute({
      sql: `SELECT p.id FROM payments p
            JOIN mandates m ON m.id = p.mandate_id
            WHERE json_extract(m.payload_json, '$.cart_mandate_id') = ?
            ORDER BY p.created_at DESC, p.rowid DESC LIMIT 1`,
      args: [cartId],
    });
    target = res.rows[0] ? String(res.rows[0].id) : null;
    if (!target) return NextResponse.json({ error: "no payments for that cart yet" }, { status: 404 });
  }
  if (!target) return NextResponse.json({ error: "?payment_row_id or ?cart_mandate_id required" }, { status: 400 });

  let res = await db().execute({ sql: "SELECT * FROM payments WHERE id = ?", args: [target] });
  let row = res.rows[0];
  if (!row) return NextResponse.json({ error: "unknown payment_row_id" }, { status: 404 });

  if (String(row.status) === "link_issued") {
    await reconcileByReference(target);
    res = await db().execute({ sql: "SELECT * FROM payments WHERE id = ?", args: [target] });
    row = res.rows[0];
  }

  const pending = await db().execute({
    sql: `SELECT a.id FROM approvals a WHERE a.mandate_id = ? AND a.outcome IS NULL`,
    args: [String(row!.mandate_id)],
  });

  return NextResponse.json({
    payment_row_id: String(row!.id),
    mandate_id: String(row!.mandate_id),
    attempt: Number(row!.attempt),
    status: String(row!.status),
    amount_paise: Number(row!.amount_paise),
    rzp_order_id: row!.rzp_order_id ? String(row!.rzp_order_id) : null,
    failure_reason: row!.failure_reason ? String(row!.failure_reason) : null,
    waiting_for_human: pending.rows.length > 0,
    updated_at: row!.updated_at ? String(row!.updated_at) : null,
  });
}
