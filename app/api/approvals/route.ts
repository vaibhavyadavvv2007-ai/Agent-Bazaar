import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { issueRailForMandate } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * The shopkeeper's bell.
 *
 * GET  → open approvals with full context (amount, reasons, chain ids)
 * POST { approval_id, decision: "approved" | "rejected", decided_by? }
 *        approved → rail issuance proceeds for the parked mandate
 *        rejected → the agent receives a structured human refusal
 */
export async function GET() {
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

  return NextResponse.json({ count: queue.length, queue });
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
    const result = await issueRailForMandate(String(row.mandate_id), req.nextUrl.origin);
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
