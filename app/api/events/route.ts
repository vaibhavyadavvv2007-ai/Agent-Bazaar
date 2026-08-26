import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?limit=50 — recent audit-trail events, OLDEST FIRST.
 * Feeds the Gazette's notifications column on page load, so the permanent
 * record is visible before anything live happens. The SSE stream continues
 * from there; clients dedupe by event id.
 */
export async function GET(req: NextRequest) {
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  const res = await db().execute({
    sql: "SELECT id, ts, session_id, type, payload_json FROM events ORDER BY ts DESC, rowid DESC LIMIT ?",
    args: [limit],
  });

  const events = res.rows
    .map((r) => ({
      id: String(r.id),
      ts: String(r.ts),
      session_id: r.session_id ? String(r.session_id) : null,
      type: String(r.type),
      payload: safeParse(String(r.payload_json ?? "{}")),
    }))
    .reverse(); // oldest first, matching the live stream's replay order

  return NextResponse.json({ events });
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
