import { NextRequest, NextResponse } from "next/server";
import { createPaymentMandate, requestCheckout } from "@/lib/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/conversational
 *   { cart_mandate_id, agent_message? }
 *
 * Creates a Razorpay order for the signed cart and returns the full order
 * details (items, total, order_id) so the client can render a conversational
 * checkout modal instead of redirecting to a hosted page.
 *
 * The modal opens Razorpay checkout.js in-app on confirm.
 */
export async function POST(req: NextRequest) {
  let body: { cart_mandate_id?: string; agent_message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.cart_mandate_id) {
    return NextResponse.json(
      { error: "cart_mandate_id required" },
      { status: 400 }
    );
  }

  try {
    // 1. Get session from cart mandate
    const cartRes = await db().execute({
      sql: "SELECT session_id, payload_json FROM mandates WHERE id = ? AND type = 'CART'",
      args: [body.cart_mandate_id],
    });
    const cartRow = cartRes.rows[0];
    if (!cartRow) {
      return NextResponse.json(
        { error: "unknown cart_mandate_id" },
        { status: 404 }
      );
    }
    const sessionId = String(cartRow.session_id);
    const cartPayload = JSON.parse(String(cartRow.payload_json)) as {
      items: { sku: string; qty: number }[];
      total_paise: number;
    };

    // 2. Resolve item details from catalog
    const items = cartPayload.items ?? [];
    const cartItems = [];
    for (const item of items) {
      const pRes = await db().execute({
        sql: "SELECT sku, title, price_paise FROM products WHERE sku = ?",
        args: [item.sku],
      });
      const p = pRes.rows[0];
      if (p) {
        cartItems.push({
          sku: String(p.sku),
          title: String(p.title),
          qty: item.qty,
          unit_price_paise: Number(p.price_paise),
          line_total_paise: Number(p.price_paise) * item.qty,
        });
      }
    }

    // 3. Create payment mandate
    const paymentMandate = await createPaymentMandate(
      sessionId,
      body.cart_mandate_id
    );

    // 4. Run the checkout gate (policy engine)
    const result = await requestCheckout(paymentMandate.id, req.nextUrl.origin);

    if (result.status === "needs_approval") {
      return NextResponse.json(
        {
          status: "needs_approval",
          approval_id: result.approval_id,
          reasons: result.reasons,
          message: "This cart requires shopkeeper approval before payment.",
        },
        { status: 202 }
      );
    }

    if (result.status === "denied") {
      return NextResponse.json(
        {
          status: "denied",
          reasons: result.reasons,
          message: "This cart was denied by the policy engine.",
        },
        { status: 403 }
      );
    }

    if (result.status !== "issued" || !result.payment_row_id) {
      return NextResponse.json(
        { error: "checkout failed", detail: result },
        { status: 500 }
      );
    }

    // 5. Get the Razorpay order ID from the payments table
    const payRes = await db().execute({
      sql: "SELECT rzp_order_id FROM payments WHERE id = ?",
      args: [result.payment_row_id],
    });
    const rzpOrderId = String(payRes.rows[0]?.rzp_order_id ?? "");

    // 6. Get agent's last message from the transcript for context
    const agentMsg =
      body.agent_message ?? generateAgentMessage(cartItems, cartPayload.total_paise);

    // 7. Emit SSE event so the bazaar floor can show the conversational modal
    await publish({
      type: "payment.checkout_conversational",
      session_id: sessionId,
      payload: {
        payment_row_id: result.payment_row_id,
        rzp_order_id: rzpOrderId,
        amount_paise: cartPayload.total_paise,
        cart_items: cartItems,
        agent_message: agentMsg,
        mandate_id: paymentMandate.id,
      },
    });

    // 8. Return details for the modal
    return NextResponse.json({
      status: "issued",
      payment_row_id: result.payment_row_id,
      rzp_order_id: rzpOrderId,
      amount_paise: cartPayload.total_paise,
      cart_items: cartItems,
      agent_message: agentMsg,
      session_id: sessionId,
      mandate_id: paymentMandate.id,
    });
  } catch (e) {
    const detail =
      e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
    console.error("[conversational-checkout] failed:", detail);
    return NextResponse.json(
      { error: "conversational checkout failed", detail },
      { status: 500 }
    );
  }
}

function generateAgentMessage(
  items: { title: string; qty: number }[],
  totalPaise: number
): string {
  const itemList = items.map((i) => `${i.title}${i.qty > 1 ? ` (×${i.qty})` : ""}`).join(", ");
  return `I would like to purchase ${itemList} from the bazaar. Total: ₹${(totalPaise / 100).toLocaleString("en-IN")}. Please review and confirm.`;
}
