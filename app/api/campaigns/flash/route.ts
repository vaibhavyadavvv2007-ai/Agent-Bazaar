import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/flash — active flash sales with countdown info.
 * Used by the FlashSaleBanner component on the bazaar floor.
 */
export async function GET() {
  const now = new Date().toISOString();

  const res = await db().execute({
    sql: `SELECT * FROM campaigns
          WHERE enabled = 1 AND kind = 'flash_sale'
            AND starts_at <= ? AND ends_at >= ?
          ORDER BY ends_at ASC`,
    args: [now, now],
  });

  const sales = res.rows.map((r) => {
    const config = JSON.parse(String(r.config_json));
    return {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      kind: "flash_sale",
      starts_at: String(r.starts_at),
      ends_at: String(r.ends_at),
      config,
    };
  });

  return NextResponse.json({ sales });
}
