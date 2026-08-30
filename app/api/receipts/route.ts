import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/receipts — the audit list, with the state facts each receipt
 * needs on its face: policy verdict, campaign applied, payment status.
 *
 * filters: ?filter=all|today|gated|failed   (honest filters — each maps to
 * a real column, nothing is invented)
 */
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const campaignId = req.nextUrl.searchParams.get("campaign");

  const res = await db().execute(`
    SELECT p.id, p.amount_paise, p.updated_at, p.rzp_payment_id, p.status, p.attempt,
           p.rzp_order_id, pm.id AS payment_mandate_id, pm.session_id,
           cm.payload_json AS cart_payload, cm.hash AS cart_hash,
           (SELECT verdict FROM policy_decisions pd
             WHERE pd.mandate_id = pm.id
             ORDER BY pd.evaluated_at DESC LIMIT 1) AS policy_verdict,
           (SELECT c.name FROM campaign_applications ca
             JOIN campaigns c ON c.id = ca.campaign_id
             WHERE ca.cart_mandate_id = cm.id
             ORDER BY ca.applied_at DESC LIMIT 1) AS campaign_name,
           (SELECT ca.campaign_id FROM campaign_applications ca
             WHERE ca.cart_mandate_id = cm.id
             ORDER BY ca.applied_at DESC LIMIT 1) AS campaign_id,
           (SELECT ca.discount_paise FROM campaign_applications ca
             WHERE ca.cart_mandate_id = cm.id
             ORDER BY ca.applied_at DESC LIMIT 1) AS campaign_discount_paise,
           (SELECT a.outcome FROM approvals a
             WHERE a.mandate_id = pm.id
             ORDER BY a.requested_at DESC LIMIT 1) AS approval_outcome
    FROM payments p
    JOIN mandates pm ON p.mandate_id = pm.id
    JOIN mandates cm ON json_extract(pm.payload_json, '$.cart_mandate_id') = cm.id
    WHERE p.status IN ('captured', 'recovered')
    ORDER BY p.updated_at DESC
  `);

  type Row = Record<string, unknown>;
  let receipts = res.rows.map((r) => {
    const row = r as Row;
    let cart: { items: { sku: string; qty: number }[] } = { items: [] };
    try {
      cart = JSON.parse(String(row.cart_payload));
    } catch {}
    return {
      id: String(row.id),
      amount_paise: Number(row.amount_paise),
      updated_at: String(row.updated_at),
      rzp_payment_id: String(row.rzp_payment_id ?? ""),
      rzp_order_id: String(row.rzp_order_id ?? ""),
      status: String(row.status),
      attempt: Number(row.attempt ?? 1),
      payment_mandate_id: String(row.payment_mandate_id),
      session_id: String(row.session_id),
      cart_hash: String(row.cart_hash ?? ""),
      policy_verdict: row.policy_verdict ? String(row.policy_verdict) : null,
      campaign_name: row.campaign_name ? String(row.campaign_name) : null,
      campaign_id: row.campaign_id ? String(row.campaign_id) : null,
      campaign_discount_paise: row.campaign_discount_paise !== null ? Number(row.campaign_discount_paise) : null,
      approval_outcome: row.approval_outcome ? String(row.approval_outcome) : null,
      items: cart.items ?? [],
    };
  });

  // Filter counts are computed BEFORE filtering so the bar always shows the
  // whole truth (ALL carries the total).
  const counts = {
    all: receipts.length,
    today: 0,
    gated: 0,
    recovered: 0,
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const r of receipts) {
    if (r.updated_at.startsWith(todayStr)) counts.today++;
    if (r.policy_verdict === "gate") counts.gated++;
    if (r.status === "recovered") counts.recovered++;
  }

  if (filter === "today") receipts = receipts.filter((r) => r.updated_at.startsWith(todayStr));
  if (filter === "gated") receipts = receipts.filter((r) => r.policy_verdict === "gate");
  if (filter === "failed") receipts = receipts.filter((r) => r.status === "recovered");

  // Optional campaign scoping — "which receipts did this campaign touch?"
  const campaignName = campaignId
    ? (receipts.find((r) => r.campaign_id === campaignId)?.campaign_name ?? null)
    : null;
  if (campaignId) receipts = receipts.filter((r) => r.campaign_id === campaignId);

  const captured_total_paise = receipts.reduce((s, r) => s + r.amount_paise, 0);

  return NextResponse.json(
    {
      receipts,
      counts,
      summary: {
        shown: receipts.length,
        captured_paise: captured_total_paise,
        captured_inr: captured_total_paise / 100,
        campaign_name: campaignName,
      },
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
