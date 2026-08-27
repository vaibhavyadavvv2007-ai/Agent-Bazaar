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
        theme: { color: "#b3282d" },
        handler: async (response: any) => {
          if (response.razorpay_payment_id) {
            try {
              await fetch("/api/checkout/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
            } catch (e) {
              console.error("Manual capture call failed", e);
            }
          }
        },
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
      const data = (await res.json()) as Status & { error?: string };
      if (!data.error) setStatus((prev) => ({ ...(prev ?? data), ...data }));
    }, 2000);
    return () => clearInterval(t);
  }, [rowId]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-8 text-center shadow-[4px_4px_0_var(--bazaar-ink)]">
        <p className="font-clause text-xs font-bold uppercase tracking-[0.25em] text-(--bazaar-ink-dim)">The Agent Bazaar</p>
        <h1 className="font-masthead mt-4 text-2xl font-bold uppercase tracking-tight">Cart mandate verified</h1>

        {!error && status && (
          <div className="mt-4 border-t border-b border-(--bazaar-line) py-3 font-clause">
            <span className="font-bold text-(--bazaar-ink)">₹{(status.amount_paise / 100).toLocaleString("en-IN")}</span>
            <span className="mx-2 text-(--bazaar-ink-dim)">·</span>
            <span className="text-xs text-(--bazaar-ink-dim)">order {status.rzp_order_id?.slice(0, 18)}…</span>
          </div>
        )}

        <div className="mt-6 font-clause text-sm font-bold">
          {error ? (
            <p className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) px-3 py-3 text-(--bazaar-ink)">[ ERROR ] {error}</p>
          ) : ["captured", "recovered"].includes(status?.status ?? "") ? (
            <p className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) px-3 py-3 text-(--bazaar-ink)">
              [ SEALED ] Payment captured; the ledger has the receipt.
            </p>
          ) : status?.status === "failed" ? (
            <p className="border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) px-3 py-3 text-(--bazaar-ink)">
              [ FAILED ] {status.failure_reason}. The agent may retry on the same signed cart.
            </p>
          ) : opened ? (
            <p className="text-(--bazaar-ink-dim)">[ CHECKOUT OPEN ] Settle with a test instrument (UPI: success@razorpay).</p>
          ) : (
            <p className="text-(--bazaar-ink-dim)">Opening Razorpay Checkout…</p>
          )}
        </div>

        {error && !opened && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 border-[1.5px] border-(--bazaar-ink) bg-transparent px-6 py-2 font-clause text-xs font-bold uppercase tracking-wider hover:bg-(--bazaar-ink) hover:text-(--paper)"
          >
            Retry
          </button>
        )}
      </div>
    </main>
  );
}
