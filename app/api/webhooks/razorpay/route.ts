import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applySettlement } from "@/lib/razorpay/rail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Razorpay webhook receiver. Signature-verified (HMAC-SHA256 over the raw
 * body with x-razorpay-signature). Always returns 200 for valid signatures —
 * non-200 makes Razorpay retry, which is fine because settlement application
 * is idempotent.
 */
type WebhookPayload = {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string | null; status?: string; error_description?: string } };
    payment_link?: { entity?: { id?: string; reference_id?: string | null; status?: string } };
  };
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Loud refusal: an unverified webhook must never touch the ledger.
    console.error("[webhook] RAZORPAY_WEBHOOK_SECRET not set — refusing");
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const payment = body.payload?.payment?.entity;
  const link = body.payload?.payment_link?.entity;

  switch (body.event) {
    case "payment.captured":
    case "payment_link.paid": {
      await applySettlement(
        "captured",
        {
          rzp_order_id: payment?.order_id ?? null,
          rzp_payment_id: payment?.id ?? null,
          reference_id: link?.reference_id ?? null,
          rzp_link_id: link?.id ?? null,
        },
        { raw: body }
      );
      break;
    }
    case "payment.failed": {
      await applySettlement(
        "failed",
        {
          rzp_order_id: payment?.order_id ?? null,
          rzp_payment_id: payment?.id ?? null,
          reference_id: link?.reference_id ?? null,
          rzp_link_id: link?.id ?? null,
        },
        { failure_reason: payment?.error_description ?? "unknown", raw: body }
      );
      break;
    }
    default:
      // Other events are recorded but need no ledger action.
      break;
  }

  return NextResponse.json({ ok: true });
}
