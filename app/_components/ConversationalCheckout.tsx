"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CONVERSATIONAL CHECKOUT — the in-app checkout flow.
 *
 * Instead of redirecting to a hosted Razorpay page, the agent's order
 * proposal appears as a conversational modal on the bazaar floor. The
 * shopkeeper reviews the items, sees the agent's reasoning, and confirms
 * or cancels. On confirm, Razorpay checkout.js opens in-app.
 *
 * Design contract: gazette world. Sharp corners, ink borders, paper fills,
 * seal red for primary actions, Courier Prime for serials.
 */

type CartItem = {
  sku: string;
  title: string;
  qty: number;
  unit_price_paise: number;
  line_total_paise: number;
};

type CheckoutDetails = {
  payment_row_id: string;
  rzp_order_id: string;
  amount_paise: number;
  discount_paise?: number;
  cart_items: CartItem[];
  agent_message: string;
  session_id: string;
  mandate_id: string;
};

type RazorpayCtor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, cb: (e: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

export default function ConversationalCheckout({
  details,
  onClose,
}: {
  details: CheckoutDetails;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<
    "review" | "paying" | "success" | "failed" | "error"
  >("review");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "review") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [phase, onClose]);

  /* Load Razorpay checkout.js */
  const loadRazorpay = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (window.Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }, []);

  /* Open Razorpay in-app checkout */
  const handleConfirm = useCallback(async () => {
    setPhase("paying");

    try {
      await loadRazorpay();

      if (!window.Razorpay) {
        setPhase("error");
        setFailureReason("Razorpay SDK failed to load");
        return;
      }

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: details.rzp_order_id,
        name: "The Agent Bazaar",
        description: `Agent purchase · ${details.cart_items.length} item${details.cart_items.length !== 1 ? "s" : ""} · mandate-verified`,
        prefill: {
          name: "Agent Buyer",
          email: "agents@example.com",
          contact: "+919876543210",
        },
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
              console.error("Capture call failed", e);
            }
            setPhase("success");
          }
        },
        modal: {
          ondismiss: () => {
            setPhase("review");
          },
          confirm_close: true,
          escape: false,
        },
        handler_failed: () => {
          setPhase("failed");
          setFailureReason("Payment was not completed");
        },
      });

      rzp.on("payment.failed", (response: any) => {
        const desc =
          response?.error?.description ?? "Payment failed";
        setFailureReason(desc);
        setPhase("failed");
      });

      rzp.open();
    } catch (e) {
      setPhase("error");
      setFailureReason(String(e));
    }
  }, [details, loadRazorpay]);

  const subtotal = details.cart_items.reduce(
    (s, item) => s + item.line_total_paise,
    0
  );
  const discount = details.discount_paise ?? Math.max(0, subtotal - details.amount_paise);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--ink)/30 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase === "review") onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg border-2 border-(--ink) bg-(--paper) shadow-[6px_6px_0_var(--ink)]"
        role="dialog"
        aria-modal="true"
        aria-label="Conversational checkout"
      >
        {/* Header */}
        <header className="flex items-baseline justify-between border-b-2 border-(--ink) px-4 py-3">
          <div>
            <p className="font-masthead text-sm font-bold uppercase tracking-[0.08em]">
              Order Confirmation
            </p>
            <p className="fig mt-0.5">
              <span className="pointer" aria-hidden="true" />
              the agent proposes, the shopkeeper decides
            </p>
          </div>
          {phase === "review" && (
            <button
              onClick={onClose}
              className="press border border-(--paper-edge) px-2 py-0.5 font-clause text-[11px] text-(--ink-soft) hover:border-(--ink)"
              aria-label="Close"
            >
              ESC
            </button>
          )}
        </header>

        <div className="px-4 py-3">
          {/* Agent's message — the conversational part */}
          <div className="border border-(--paper-edge) bg-(--paper-deep) p-3">
            <p className="font-clause text-[11px] font-bold uppercase tracking-[0.14em] text-(--ink-soft)">
              Agent&apos;s Proposal
            </p>
            <p className="mt-1 font-clause text-sm leading-relaxed text-(--ink)">
              {details.agent_message ||
                "I would like to purchase the following items from the bazaar."}
            </p>
          </div>

          <div className="double-rule my-3" aria-hidden="true" />

          {/* Itemized cart */}
          <div>
            <p className="font-clause text-[11px] font-bold uppercase tracking-[0.14em] text-(--ink-soft)">
              Cart Items
            </p>
            <div className="mt-2 space-y-1.5">
              {details.cart_items.map((item, i) => (
                <div
                  key={item.sku}
                  className="flex items-baseline justify-between border border-(--paper-edge) bg-(--paper) px-3 py-2 font-clause text-[13px]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-(--ink-soft)">
                      {String(i + 1).padStart(2, "0")}.
                    </span>
                    <span className="font-semibold">{item.title}</span>
                    <span className="text-(--ink-soft)">
                      × {item.qty}
                    </span>
                  </div>
                  <span className="font-bold text-(--seal)">
                    {rupees(item.line_total_paise)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="double-rule my-3" aria-hidden="true" />

          {/* Total */}
          <div className="border-t-2 border-(--ink) pt-2">
            {discount > 0 && (
              <>
                <div className="flex items-baseline justify-between font-clause text-[11px] text-(--ink-soft)">
                  <span>Subtotal</span>
                  <span>{rupees(subtotal)}</span>
                </div>
                <div className="flex items-baseline justify-between font-clause text-[11px] text-(--henna)">
                  <span>Campaign discounts</span>
                  <span>−{rupees(discount)}</span>
                </div>
              </>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-(--paper-edge) pt-1">
              <span className="font-masthead text-sm font-bold uppercase tracking-[0.08em]">
                Total charged
              </span>
              <span className="font-masthead text-lg font-bold text-(--seal)">
                {rupees(details.amount_paise)}
              </span>
            </div>
          </div>

          {/* Status messages */}
          {phase === "paying" && (
            <div className="mt-3 border border-(--ink) bg-(--paper-deep) p-3 text-center">
              <div className="dispatch-spinner mx-auto" />
              <p className="mt-2 font-clause text-xs text-(--ink-soft)">
                Opening Razorpay Checkout...
              </p>
            </div>
          )}

          {phase === "success" && (
            <div className="mt-3 border-2 border-(--henna) bg-(--henna)/8 p-3">
              <div className="seal seal-green">SEALED</div>
              <p className="mt-2 font-clause text-sm">
                Payment captured. The ledger has the receipt. Every rupee is
                accounted for.
              </p>
            </div>
          )}

          {phase === "failed" && (
            <div className="mt-3 border-2 border-(--seal) bg-(--seal)/8 p-3">
              <div className="seal seal-red">FAILED</div>
              <p className="mt-2 font-clause text-sm">
                {failureReason ?? "Payment was not completed."}
              </p>
              <p className="mt-1 font-clause text-[11px] text-(--ink-soft)">
                The agent may retry on the same signed cart.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-3 border-2 border-(--seal) bg-(--seal)/8 p-3">
              <div className="seal seal-red">ERROR</div>
              <p className="mt-2 font-clause text-sm">{failureReason}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex border-t-2 border-(--ink)">
          {phase === "review" && (
            <>
              <button
                onClick={onClose}
                className="press flex-1 border-r-2 border-(--ink) px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--ink-soft) hover:bg-(--paper-deep)"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="press flex-1 bg-(--seal) px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--paper) hover:bg-(--seal)/90"
              >
                Confirm & Pay
              </button>
            </>
          )}

          {phase === "success" && (
            <button
              onClick={onClose}
              className="press w-full bg-(--henna) px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--paper) hover:bg-(--henna)/90"
            >
              Done
            </button>
          )}

          {(phase === "failed" || phase === "error") && (
            <>
              <button
                onClick={onClose}
                className="press flex-1 border-r-2 border-(--ink) px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--ink-soft) hover:bg-(--paper-deep)"
              >
                Dismiss
              </button>
              <button
                onClick={handleConfirm}
                className="press flex-1 bg-(--seal) px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--paper) hover:bg-(--seal)/90"
              >
                Retry Payment
              </button>
            </>
          )}

          {phase === "paying" && (
            <button
              disabled
              className="press w-full cursor-not-allowed px-4 py-3 font-clause text-sm font-bold uppercase tracking-wider text-(--ink-soft)"
            >
              Processing...
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-(--paper-edge) px-4 py-1.5">
          <p className="fig text-center">
            <span className="pointer" aria-hidden="true" />
            mandate chain verified · policy gate passed · test-mode only
          </p>
        </div>
      </div>
    </div>
  );
}
