import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applySettlement } from "@/lib/razorpay/rail";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string(),
  razorpay_signature: z.string(),
});

/**
 * Manual capture endpoint.
 * Because Razorpay webhooks cannot reach `localhost`, this endpoint allows
 * the client-side checkout handler to manually verify and record a successful
 * payment.
 */
export async function POST(req: NextRequest) {
  try {
    const body = inputSchema.parse(await req.json());
    
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Missing RAZORPAY_KEY_SECRET" }, { status: 500 });
    }

    // Verify the checkout signature: hmac_sha256(order_id + "|" + payment_id, secret)
    const payload = body.razorpay_order_id + "|" + body.razorpay_payment_id;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    
    const a = Buffer.from(body.razorpay_signature);
    const b = Buffer.from(expected);
    
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    // Signature matches, this is a legitimate payment success.
    await applySettlement("captured", {
      rzp_order_id: body.razorpay_order_id,
      rzp_payment_id: body.razorpay_payment_id,
      reference_id: null,
      rzp_link_id: null,
    }, {
      raw: { via: "manual_capture", ...body },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Capture failed:", error);
    return NextResponse.json({ error: "capture processing failed", detail: String(error) }, { status: 500 });
  }
}
