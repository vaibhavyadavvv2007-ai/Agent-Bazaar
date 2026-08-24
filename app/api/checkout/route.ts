import { NextRequest, NextResponse } from "next/server";
import { createPaymentMandate, requestCheckout } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 *   { payment_mandate_id }  — gate an already-signed PAYMENT mandate, or
 *   { cart_mandate_id }     — shorthand: sign the PAYMENT mandate (merchant)
 *                             then run the gate.
 *
 * allow → real test-mode order + payment link issued
 * gate  → parked in the human approval queue (shopkeeper bell)   [202]
 * deny  → structured refusal with named rule hits                [403]
 */
export async function POST(req: NextRequest) {
  let body: { payment_mandate_id?: string; cart_mandate_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.payment_mandate_id && !body.cart_mandate_id) {
    return NextResponse.json({ error: "payment_mandate_id or cart_mandate_id required" }, { status: 400 });
  }

  try {
    const paymentMandateId =
      body.payment_mandate_id ?? (await createPaymentMandateFor(body.cart_mandate_id!));
    if (!paymentMandateId) {
      return NextResponse.json({ error: "unknown cart_mandate_id" }, { status: 404 });
    }

    const result = await requestCheckout(paymentMandateId);
    const status = result.status === "issued" ? 200 : result.status === "needs_approval" ? 202 : 403;
    return NextResponse.json({ ...result, payment_mandate_id: paymentMandateId }, { status });
  } catch (e) {
    return NextResponse.json({ error: "checkout failed", detail: String(e) }, { status: 500 });
  }
}

async function createPaymentMandateFor(cartMandateId: string): Promise<string | null> {
  try {
    // Session id comes from the cart itself.
    const { db } = await import("@/lib/db");
    const res = await db().execute({
      sql: "SELECT session_id FROM mandates WHERE id = ? AND type = 'CART'",
      args: [cartMandateId],
    });
    const sessionId = res.rows[0] ? String(res.rows[0].session_id) : null;
    if (!sessionId) return null;
    const m = await createPaymentMandate(sessionId, cartMandateId);
    return m.id;
  } catch {
    return null;
  }
}
