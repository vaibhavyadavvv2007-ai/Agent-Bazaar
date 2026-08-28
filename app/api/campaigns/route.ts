import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { evaluateCampaigns, campaignFromRow, type CartItem } from "@/lib/campaigns/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns — list active campaigns
 * GET /api/campaigns?evaluate=1&cart_mandate_id=... — evaluate campaigns against a cart
 *
 * POST /api/campaigns — create a new campaign (merchant dashboard)
 */
export async function GET(req: NextRequest) {
  const now = new Date().toISOString();
  const evaluate = req.nextUrl.searchParams.get("evaluate");
  const cartMandateId = req.nextUrl.searchParams.get("cart_mandate_id");

  // List ALL campaigns (merchant management view)
  const all = req.nextUrl.searchParams.get("all");
  const whereClause = all === "1"
    ? `SELECT * FROM campaigns ORDER BY kind, name`
    : `SELECT * FROM campaigns WHERE enabled = 1 AND starts_at <= ? AND ends_at >= ? ORDER BY kind, name`;
  const args = all === "1" ? [] : [now, now];
  const res = await db().execute({ sql: whereClause, args });
  const campaigns = res.rows.map((r) => {
    const c = campaignFromRow(r as any);
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      kind: c.kind,
      config: c.config,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      enabled: c.enabled,
    };
  });

  // Get application stats for each campaign
  const statsRes = await db().execute({
    sql: `SELECT campaign_id, COUNT(*) AS times_applied, COALESCE(SUM(discount_paise), 0) AS total_discount
          FROM campaign_applications GROUP BY campaign_id`,
    args: [],
  });
  const statsMap = new Map<string, { times_applied: number; total_discount: number }>();
  for (const row of statsRes.rows) {
    statsMap.set(String(row.campaign_id), {
      times_applied: Number(row.times_applied),
      total_discount: Number(row.total_discount),
    });
  }
  const campaignsWithStats = campaigns.map((c) => ({
    ...c,
    stats: statsMap.get(c.id) ?? { times_applied: 0, total_discount: 0 },
  }));

  // Optional: evaluate against a cart
  if (evaluate === "1" && cartMandateId) {
    const cartRes = await db().execute({
      sql: "SELECT payload_json FROM mandates WHERE id = ? AND type = 'CART'",
      args: [cartMandateId],
    });
    if (cartRes.rows[0]) {
      try {
        const cartPayload = JSON.parse(String(cartRes.rows[0].payload_json)) as {
          items: { sku: string; qty: number }[];
        };
        const cartItems: CartItem[] = [];
        for (const item of cartPayload.items ?? []) {
          const pRes = await db().execute({
            sql: "SELECT sku, title, category, price_paise FROM products WHERE sku = ?",
            args: [item.sku],
          });
          const p = pRes.rows[0];
          if (p) {
            cartItems.push({
              sku: String(p.sku),
              title: String(p.title),
              category: String(p.category),
              qty: item.qty,
              unit_price_paise: Number(p.price_paise),
              line_total_paise: Number(p.price_paise) * item.qty,
            });
          }
        }

        const allCampaigns = res.rows.map((r) => campaignFromRow(r as any));
        const evaluation = evaluateCampaigns(allCampaigns, cartItems, now);

        return NextResponse.json({
          campaigns,
          evaluation: {
            applicable: evaluation.applicable,
            total_discount_paise: evaluation.total_discount_paise,
            original_total_paise: evaluation.original_total_paise,
            final_total_paise: evaluation.final_total_paise,
          },
        });
      } catch {
        // Fall through to plain list
      }
    }
  }

  return NextResponse.json({ campaigns: campaignsWithStats });
}

/**
 * POST /api/campaigns — create a new campaign
 *
 * Body: { name, description, kind, config, starts_at, ends_at }
 */
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    description?: string;
    kind?: string;
    config?: Record<string, unknown>;
    starts_at?: string;
    ends_at?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.kind || !body.config || !body.starts_at || !body.ends_at) {
    return NextResponse.json(
      { error: "name, kind, config, starts_at, ends_at required" },
      { status: 400 }
    );
  }

  if (!["bundle", "flash_sale", "cross_sell"].includes(body.kind)) {
    return NextResponse.json(
      { error: "kind must be bundle, flash_sale, or cross_sell" },
      { status: 400 }
    );
  }

  const id = `camp_${randomUUID().slice(0, 8)}`;
  await db().execute({
    sql: `INSERT INTO campaigns (id, name, description, kind, config_json, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.name,
      body.description ?? "",
      body.kind,
      JSON.stringify(body.config),
      body.starts_at,
      body.ends_at,
    ],
  });

  return NextResponse.json({ id, status: "created" }, { status: 201 });
}
