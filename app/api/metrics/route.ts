import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — the honest-numbers endpoint.
 *
 * Everything here is computed from the append-only ledger, never cached and
 * never hand-set. Traffic is synthetic (driven by scripts/demo.ts) and the
 * dashboard labels it as such — measured honesty is the point.
 */
export async function GET() {
  const one = async (sql: string, args: (string | number)[] = []) => {
    const r = await db().execute({ sql, args });
    return r.rows[0] ?? {};
  };

  const [sessions, paymentsAgg, verdicts, approvalsRows, failures, suggestions, topItems, campaignApps] = await Promise.all([
    db().execute(`SELECT provider, COUNT(*) AS n FROM sessions GROUP BY provider`),
    db().execute(`
      SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_paise),0) AS paise
      FROM payments GROUP BY status`),
    db().execute(`SELECT verdict, COUNT(*) AS n FROM policy_decisions GROUP BY verdict`),
    db().execute(`
      SELECT requested_at, decided_at
      FROM approvals WHERE outcome = 'approved' AND decided_at IS NOT NULL`),
    db().execute(`
      SELECT COALESCE(failure_reason,'unknown') AS reason, COUNT(*) AS n
      FROM payments WHERE status = 'failed' GROUP BY 1 ORDER BY n DESC`),
    db().execute(`
      SELECT COUNT(*) AS presented,
             SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted
      FROM suggestions`),
    db().execute(`
      SELECT COUNT(*) AS total, COALESCE(SUM(discount_paise), 0) AS total_discount
      FROM campaign_applications`),
    db().execute(`
      SELECT json_extract(j.value, '$.sku') AS sku,
             CAST(json_extract(j.value, '$.qty') AS INTEGER) AS qty,
             json_extract(m.payload_json, '$.total_paise') AS total
      FROM mandates m, json_each(json_extract(m.payload_json, '$.items')) j
      WHERE m.type = 'CART'`),
  ]);

  // Approval latency in seconds (p50 / p95), computed in JS from raw rows.
  const latencies = approvalsRows.rows
    .map((r) => (new Date(String(r.decided_at) + "Z").getTime() - new Date(String(r.requested_at) + "Z").getTime()) / 1000)
    .filter((s) => Number.isFinite(s) && s >= 0)
    .sort((a, b) => a - b);
  const pick = (q: number) => (latencies.length ? Math.round(latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))]) : null);

  const gmvCaptured = paymentsAgg.rows
    .filter((r) => ["captured", "recovered"].includes(String(r.status)))
    .reduce((s, r) => s + Number(r.paise ?? 0), 0);

  const failedCount = Number(paymentsAgg.rows.find((r) => String(r.status) === "failed")?.n ?? 0);
  const capturedCount = Number(paymentsAgg.rows.find((r) => String(r.status) === "captured")?.n ?? 0);
  const recoveredCount = Number(paymentsAgg.rows.find((r) => String(r.status) === "recovered")?.n ?? 0);
  const attemptsTotal = paymentsAgg.rows.reduce((s, r) => s + Number(r.n ?? 0), 0);

  const presented = Number(suggestions.rows[0]?.presented ?? 0);
  const acceptedSuggestions = Number(suggestions.rows[0]?.accepted ?? 0);

  // Attach value: accepted suggestions' contribution — approximated by the
  // price of suggested products that ended up in a cart line item.
  const itemQty = new Map<string, number>();
  for (const row of topItems.rows) {
    if (!row.sku) continue;
    itemQty.set(String(row.sku), (itemQty.get(String(row.sku)) ?? 0) + Number(row.qty ?? 0));
  }

  const verdictCount = (v: string) => Number(verdicts.rows.find((r) => String(r.verdict) === v)?.n ?? 0);
  const decisionsTotal = verdicts.rows.reduce((s, r) => s + Number(r.n ?? 0), 0);

  const campaignTotal = Number(campaignApps.rows[0]?.total ?? 0);
  const campaignDiscount = Number(campaignApps.rows[0]?.total_discount ?? 0);

  return NextResponse.json({
    label: "SYNTHETIC TRAFFIC — driven by scripts/demo.ts; no real money",
    sessions_by_provider: Object.fromEntries(sessions.rows.map((r) => [String(r.provider), Number(r.n)])),
    money: {
      captured_paise: gmvCaptured,
      captured_inr: gmvCaptured / 100,
      attempts_total: attemptsTotal,
      captured_count: capturedCount,
      failed_count: failedCount,
      recovered_count: recoveredCount,
      recovery_rate: failedCount > 0 ? recoveredCount / failedCount : null,
    },
    policy: {
      allow: verdictCount("allow"),
      gate: verdictCount("gate"),
      deny: verdictCount("deny"),
      total_decisions: decisionsTotal,
      gate_rate: decisionsTotal ? verdictCount("gate") / decisionsTotal : null,
      deny_rate: decisionsTotal ? verdictCount("deny") / decisionsTotal : null,
    },
    human_in_loop: {
      approvals_granted: approvalsRows.rows.length,
      approval_latency_seconds: { p50: pick(0.5), p95: pick(0.95) },
    },
    growth: {
      suggestions_presented: presented,
      suggestions_accepted: acceptedSuggestions,
      attach_rate: presented ? acceptedSuggestions / presented : null,
      items_sold_estimate: Object.fromEntries([...itemQty.entries()]),
    },
    campaigns: {
      total_applied: campaignTotal,
      total_discount_paise: campaignDiscount,
      total_discount_inr: campaignDiscount / 100,
    },
    failures_by_reason: Object.fromEntries(failures.rows.map((r) => [String(r.reason), Number(r.n)])),
  });
}
