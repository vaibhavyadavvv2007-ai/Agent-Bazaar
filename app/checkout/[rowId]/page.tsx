"use client";

import { use, useEffect, useState } from "react";

/**
 * Hosted checkout page — OUR storefront surface for completing a payment.
 *
 * This is the authentic merchant integration (Razorpay Checkout Standard on
 * the merchant's own site), not a no-code link page. The modal opens with
 * contact prefilled; the settlement driver (or the shopkeeper on camera)
 * picks UPI and completes with test instruments:
 *   success@razorpay → captured · failure@razorpay → failed
 */
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (e: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

type Status = {
  payment_row_id: string;
  status: string;
  amount_paise: number;
  rzp_order_id: string | null;
  failure_reason: string | null;
};

export default function CheckoutPage({ params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = use(params);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const res = await fetch(`/api/status?payment_row_id=${rowId}`);
      const data = (await res.json()) as Status & { error?: string };
      if (cancelled) return;
      if (data.error || !data.rzp_order_id) {
        setError(data.error ?? "no order on this payment row");
        return;
      }
      setStatus(data);

      await new Promise<void>((resolve) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        document.body.appendChild(script);
      });
      if (cancelled || !window.Razorpay) return;

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: data.rzp_order_id,
        name: "The Agent Bazaar",
        description: "Agent purchase · mandate-verified cart",
        prefill: { name: "Agent Buyer", email: "agents@example.com", contact: "+919876543210" },
        theme: { color: "#f59e0b" },
        handler: () => {}, // truth comes from webhook/poll, not the browser
        modal: { ondismiss: () => setError("checkout dismissed before settlement") },
      });
      rzp.open();
      setOpened(true);
    }

    boot().catch((e) => !cancelled && setError(String(e)));
    return () => { cancelled = true; };
  }, [rowId]);

  // Poll the ledger so the page reflects settlement within ~2s.
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/status?payment_row_id=${rowId}`);
      const data = (await res.json()) as Status;
      if (!data.error) setStatus((prev) => ({ ...(prev ?? (data as Status)), ...data }));
    }, 2000);
    return () => clearInterval(t);
  }, [rowId]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-(--bazaar-line) bg-(--bazaar-panel) p-6 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-(--bazaar-saffron)">The Agent Bazaar</p>
        <h1 className="mt-2 text-xl font-semibold">Cart mandate verified</h1>

        {!error && status && (
          <p className="mt-2 text-sm text-(--bazaar-ink-dim)">
            ₹{(status.amount_paise / 100).toLocaleString("en-IN")} · order{" "}
            <code className="text-xs">{status.rzp_order_id?.slice(0, 18)}…</code>
          </p>
        )}

        <div className="mt-6 text-sm">
          {error ? (
            <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-red-300">⚠️ {error}</p>
          ) : ["captured", "recovered"].includes(status?.status ?? "") ? (
            <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-300">
              ✅ Payment captured — the ledger has the receipt.
            </p>
          ) : status?.status === "failed" ? (
            <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-red-300">
              ⚠️ Payment failed ({status.failure_reason}) — the agent may retry on the same signed cart.
            </p>
          ) : opened ? (
            <p className="text-(--bazaar-ink-dim)">🔔 Checkout open — settle with a test instrument (UPI: success@razorpay).</p>
          ) : (
            <p className="text-(--bazaar-ink-dim)">Opening Razorpay Checkout…</p>
          )}
        </div>

        {error && !opened && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-(--bazaar-line) px-4 py-1.5 text-sm hover:border-(--bazaar-saffron)"
          >
            Retry
          </button>
        )}
      </div>
    </main>
  );
}
