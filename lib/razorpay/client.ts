import Razorpay from "razorpay";

/**
 * Thin typed wrapper over the official `razorpay` SDK. Test-mode only.
 *
 * Verified constraint shaping this design: Razorpay exposes NO headless
 * payment-authorization API — not even in test mode. Money completes only on
 * a Razorpay-hosted surface (Checkout or Payment Link page). So the rail is:
 *
 *   create order (API) → issue payment link (API) → settlement driver
 *   completes the hosted page → signed webhook + poll reconciler confirm.
 *
 * The hosted-page step is not a hack to hide: it is AP2's Cart Mandate in
 * physical form — a human (or scripted driver) verifies the exact cart on the
 * payment processor's own surface before money moves.
 */

let _rzp: Razorpay | null = null;

export function rzp(): Razorpay {
  if (!_rzp) {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID (or NEXT_PUBLIC_RAZORPAY_KEY_ID) / RAZORPAY_KEY_SECRET missing");
    }
    if (!keyId.startsWith("rzp_test_")) {
      // Hard stop, deliberately loud: this project must never touch live keys.
      throw new Error("refusing to start: Agent Bazaar is test-mode only");
    }
    _rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _rzp;
}

export type RzpOrder = { id: string; amount: number; currency: string; status: string; receipt?: string };

export async function createOrder(opts: {
  amount_paise: number;
  receipt: string; // ≤40 chars — we use our payments.id
  notes: Record<string, string>;
}): Promise<RzpOrder> {
  return rzp().orders.create({
    amount: opts.amount_paise,
    currency: "INR",
    receipt: opts.receipt,
    notes: opts.notes,
  }) as unknown as Promise<RzpOrder>;
}

export type RzpPaymentLink = { id: string; short_url: string; amount: number; status: string };

export async function createPaymentLink(opts: {
  reference_id: string; // our payments.id — echoed back by webhooks
  amount_paise: number;
  description: string;
  notes: Record<string, string>;
}): Promise<RzpPaymentLink> {
  const link = await rzp().paymentLink.create({
    amount: opts.amount_paise,
    currency: "INR",
    accept_partial: false,
    reference_id: opts.reference_id,
    description: opts.description.slice(0, 255),
    customer: {
      name: "Agent Buyer",
      email: "agents@example.com",
      // Razorpay rejects recurring-digit test numbers; use a realistic one.
      contact: "+919876543210",
    },
    notify: { sms: false, email: false },
    notes: opts.notes,
  });
  return link as unknown as RzpPaymentLink;
}

export type RzpPayment = {
  id: string;
  order_id?: string | null;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  amount: number;
  error_description?: string;
  error_source?: string;
};

export async function fetchPayment(paymentId: string): Promise<RzpPayment | null> {
  try {
    return (await rzp().payments.fetch(paymentId)) as unknown as RzpPayment;
  } catch {
    return null;
  }
}

export async function fetchLinkStatus(linkId: string): Promise<string | null> {
  try {
    const link = (await rzp().paymentLink.fetch(linkId)) as unknown as { status: string };
    return link.status ?? null; // created | partially_paid | paid | cancelled | expired
  } catch {
    return null;
  }
}

/** All payments made against an order — the poll reconciler's ground truth. */
export async function fetchOrderPayments(orderId: string): Promise<RzpPayment[]> {
  try {
    const res = (await rzp().orders.fetchPayments(orderId)) as unknown as { items: RzpPayment[] };
    return res.items ?? [];
  } catch {
    return [];
  }
}
