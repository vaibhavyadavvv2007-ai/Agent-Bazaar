import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { evaluateCampaigns, campaignFromRow, type CampaignResult, type CartItem } from "./engine";

/**
 * Campaign pricing at checkout — ONE implementation shared by every front
 * door (StoreTools, REST /api/checkout, the MCP server). Cart in, priced
 * payment mandate out. The discount lands in the signed mandate amount, so
 * the mandate, the Razorpay order and the ledger all carry the same number.
 *
 * Applications the agent already recorded via the apply_campaign tool are
 * not double-counted: they are priced in, but not re-recorded.
 */

export type CartPricing = {
  items: CartItem[];
  original_total_paise: number;
  discount_paise: number;
  final_total_paise: number;
  applicable: CampaignResult[];
  /** campaign ids already recorded against this cart (agent-initiated). */
  already_recorded: Set<string>;
};

/** Resolve a signed CART mandate into priced line items. */
export async function cartItemsForMandate(cartMandateId: string): Promise<CartItem[]> {
  const cartRes = await db().execute({
    sql: "SELECT payload_json FROM mandates WHERE id = ? AND type = 'CART'",
    args: [cartMandateId],
  });
  try {
    const cartPayload = JSON.parse(String(cartRes.rows[0]?.payload_json ?? "{}")) as {
      items: { sku: string; qty: number }[];
    };
    const items: CartItem[] = [];
    for (const item of cartPayload.items ?? []) {
      const pRes = await db().execute({
        sql: "SELECT sku, title, category, price_paise FROM products WHERE sku = ?",
        args: [item.sku],
      });
      const p = pRes.rows[0];
      if (p) {
        items.push({
          sku: String(p.sku),
          title: String(p.title),
          category: String(p.category),
          qty: item.qty,
          unit_price_paise: Number(p.price_paise),
          line_total_paise: Number(p.price_paise) * item.qty,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** Evaluate every active campaign against a signed cart. Pure read. */
export async function priceCartWithCampaigns(cartMandateId: string): Promise<CartPricing> {
  const items = await cartItemsForMandate(cartMandateId);
  const now = new Date().toISOString();
  const res = await db().execute({
    sql: `SELECT * FROM campaigns WHERE enabled = 1 AND starts_at <= ? AND ends_at >= ?`,
    args: [now, now],
  });
  const campaigns = res.rows.map((r) => campaignFromRow(r as unknown as Parameters<typeof campaignFromRow>[0]));
  const evaluation = evaluateCampaigns(campaigns, items, now);

  const alreadyRes = await db().execute({
    sql: "SELECT campaign_id FROM campaign_applications WHERE cart_mandate_id = ?",
    args: [cartMandateId],
  });
  const alreadyRecorded = new Set(alreadyRes.rows.map((r) => String(r.campaign_id)));

  return {
    items,
    original_total_paise: evaluation.original_total_paise,
    discount_paise: evaluation.total_discount_paise,
    final_total_paise: evaluation.final_total_paise,
    applicable: evaluation.applicable,
    already_recorded: alreadyRecorded,
  };
}

/**
 * Persist + publish the campaign applications for a cart. Call ONLY once the
 * checkout has actually issued — a discount on a denied cart never happened.
 */
export async function recordCampaignApplications(
  sessionId: string,
  cartMandateId: string,
  pricing: CartPricing
): Promise<void> {
  for (const applied of pricing.applicable) {
    if (pricing.already_recorded.has(applied.campaign_id)) continue;
    const appId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db().execute({
      sql: `INSERT INTO campaign_applications (id, campaign_id, session_id, cart_mandate_id, discount_paise, final_paise)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [appId, applied.campaign_id, sessionId, cartMandateId, applied.discount_paise, pricing.final_total_paise],
    });
    await publish({
      type: "campaign.applied",
      session_id: sessionId,
      payload: {
        campaign_id: applied.campaign_id,
        campaign_name: applied.campaign_name,
        kind: applied.kind,
        discount_paise: applied.discount_paise,
        final_paise: pricing.final_total_paise,
        detail: applied.detail,
      },
    });
  }
}
