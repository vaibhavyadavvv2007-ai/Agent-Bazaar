import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { priceCartWithCampaigns } from "@/lib/campaigns/apply";

/**
 * Publishes the `payment.checkout_conversational` event — the ONLY trigger the
 * bazaar-floor checkout modal (the in-app pay button) listens for.
 *
 * Both issuance paths must fire it:
 *   immediate  → the rail issues inside request_checkout (under the policy gate)
 *   gated      → the rail issues when the shopkeeper approves (> policy gate)
 *
 * The gated path used to skip this event, so approving a large cart issued a
 * real Razorpay order that no UI ever offered a checkout button for.
 */
export async function publishCheckoutConversational(input: {
  paymentMandateId: string;
  paymentRowId: string;
  rzpOrderId: string;
  amountPaise: number;
}): Promise<void> {
  const res = await db().execute({
    sql: "SELECT session_id, payload_json FROM mandates WHERE id = ?",
    args: [input.paymentMandateId],
  });
  const row = res.rows[0];
  let sessionId = "";
  let cartMandateId: string | null = null;
  try {
    const payload = JSON.parse(String(row?.payload_json ?? "{}")) as { cart_mandate_id?: string };
    sessionId = String(row?.session_id ?? "");
    cartMandateId = payload.cart_mandate_id ?? null;
  } catch {
    // unreadable mandate — still publish; an empty cart beats no checkout at all
  }

  // Full list price + the discount the signed mandate already baked in.
  const pricing = cartMandateId ? await priceCartWithCampaigns(cartMandateId) : null;
  const cartItems = pricing?.items ?? [];
  const amountPaise = input.amountPaise || pricing?.original_total_paise || 0;

  await publish({
    type: "payment.checkout_conversational",
    session_id: sessionId,
    payload: {
      payment_row_id: input.paymentRowId,
      rzp_order_id: input.rzpOrderId,
      amount_paise: amountPaise,
      discount_paise: pricing && pricing.discount_paise > 0 ? pricing.discount_paise : undefined,
      cart_items: cartItems,
      agent_message: generateAgentMessage(cartItems, amountPaise),
      mandate_id: input.paymentMandateId,
    },
  });
}

function generateAgentMessage(items: { title: string; qty: number }[], totalPaise: number): string {
  const itemList = items.map((i) => `${i.title}${i.qty > 1 ? ` (×${i.qty})` : ""}`).join(", ");
  return `I would like to purchase ${itemList} from the bazaar. Total: ₹${(totalPaise / 100).toLocaleString("en-IN")}. Please review and confirm.`;
}

export type OpenCheckout = {
  payment_row_id: string;
  amount_paise: number;
  created_at: string;
  checkout_url: string;
};

/**
 * Payments whose rails issued but nobody has paid yet. The approvals page
 * shows these with an "Open checkout" button — so a checkout is reachable
 * no matter WHERE the approval happened (floor bell or queue page), and it
 * survives navigation and reloads. Rows leave this list when the payment
 * settles (captured/failed).
 */
export async function listOpenCheckouts(origin: string, limit = 10): Promise<OpenCheckout[]> {
  const res = await db().execute({
    sql: `SELECT id, amount_paise, created_at FROM payments WHERE status = 'checkout_open' ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    payment_row_id: String(r.id),
    amount_paise: Number(r.amount_paise ?? 0),
    created_at: String(r.created_at),
    checkout_url: `${origin}/checkout/${r.id}`,
  }));
}
