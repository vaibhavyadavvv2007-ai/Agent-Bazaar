"use client";

import { useEffect, useState } from "react";

/**
 * FLASH SALE BANNER — a time-limited offer with a live countdown.
 *
 * Appears on the bazaar floor when a flash sale is active. Shows the deal,
 * a ticking countdown, and urgency styling that intensifies as time runs out.
 * When the timer hits zero, the banner fades and shows "EXPIRED".
 *
 * Design contract: gazette world. Seal red for urgency, Courier Prime for
 * the countdown, sharp corners, ink borders.
 */

type FlashSale = {
  id: string;
  name: string;
  description: string;
  ends_at: string; // ISO timestamp
  config: {
    skus: string[];
    sale_price_paise: number;
  };
};

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

function getTimeRemaining(endsAt: string) {
  const now = Date.now();
  const end = new Date(endsAt).getTime();
  const diff = Math.max(0, end - now);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { total: diff, hours, minutes, seconds, expired: diff <= 0 };
}

export default function FlashSaleBanner({
  sales,
}: {
  sales: FlashSale[];
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (sales.length === 0) return null;

  return (
    <div className="space-y-2">
      {sales.map((sale) => (
        <FlashSaleCard key={sale.id} sale={sale} tick={tick} />
      ))}
    </div>
  );
}

function FlashSaleCard({ sale, tick }: { sale: FlashSale; tick: number }) {
  const remaining = getTimeRemaining(sale.ends_at);
  const urgency =
    remaining.total < 60000
      ? "critical"
      : remaining.total < 180000
        ? "high"
        : "normal";

  if (remaining.expired) {
    return (
      <div className="border border-(--paper-edge) bg-(--paper-deep) px-3 py-2 opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-clause text-[11px] font-bold uppercase tracking-[0.14em] text-(--ink-soft)">
              Flash Sale Ended
            </p>
            <p className="font-clause text-xs text-(--ink-soft)">
              {sale.name}
            </p>
          </div>
          <span className="seal seal-red text-[11px]">EXPIRED</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-2 px-3 py-2 ${
        urgency === "critical"
          ? "border-(--warn) bg-(--warn)/8"
          : urgency === "high"
            ? "border-(--warn) bg-(--paper)"
            : "border-(--ink) bg-(--paper)"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-masthead text-xs font-bold uppercase tracking-[0.08em]">
              {sale.name}
            </p>
            <span className="seal seal-red text-[11px]">FLASH</span>
          </div>
          <p className="mt-0.5 font-body text-[13px] leading-snug text-(--ink-soft)">
            {sale.description}
          </p>
          <p className="mt-0.5 font-clause text-[11px]">
            <span className="font-bold digits text-[13px]">
              {rupees(sale.config.sale_price_paise)}
            </span>
            <span className="ml-1 text-(--ink-soft)">
              per unit · {sale.config.skus.length} SKU{sale.config.skus.length !== 1 ? "s" : ""}
            </span>
          </p>
        </div>

        {/* Countdown — instrument digits. Time pressure is a warning, not a
            failure, so urgency renders amber, never seal red. */}
        <div className="ml-3 text-right">
          <div className={`digits text-lg ${urgency !== "normal" ? "text-(--warn)" : "text-(--ink)"}`}>
            {remaining.hours > 0 && (
              <>
                {String(remaining.hours).padStart(2, "0").split("").map((d, i) => (
                  <span key={`h${i}`} className={`digit ${urgency === "critical" ? "animate-pulse" : ""}`}>{d}</span>
                ))}
                <span className="mx-px">:</span>
              </>
            )}
            {String(remaining.minutes).padStart(2, "0").split("").map((d, i) => (
              <span key={`m${i}`} className={`digit ${urgency === "critical" ? "animate-pulse" : ""}`}>{d}</span>
            ))}
            <span className="mx-px">:</span>
            {String(remaining.seconds).padStart(2, "0").split("").map((d, i) => (
              <span key={`s${i}`} className={`digit ${urgency === "critical" ? "animate-pulse" : ""}`}>{d}</span>
            ))}
          </div>
          <p className="font-clause text-[11px] uppercase tracking-wider text-(--ink-soft)">
            {urgency === "critical"
              ? "ending soon"
              : urgency === "high"
                ? "hurry"
                : "remaining"}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1 w-full bg-(--paper-edge)">
        <div
          className={`h-full transition-all duration-1000 ${
            urgency !== "normal" ? "bg-(--warn)" : "bg-(--ink)"
          }`}
          style={{
            width: `${Math.max(0, Math.min(100, (remaining.total / (5 * 60 * 1000)) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}
