"use client";

import { useEffect, useState } from "react";
import FlashSaleBanner from "./FlashSaleBanner";

type FlashSale = {
  id: string;
  name: string;
  description: string;
  ends_at: string;
  config: { skus: string[]; sale_price_paise: number };
};

/**
 * Wrapper that polls /api/campaigns/flash every 10 seconds and renders
 * the FlashSaleBanner when active flash sales exist.
 */
export default function FlashSaleBannerWrapper() {
  const [sales, setSales] = useState<FlashSale[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/campaigns/flash")
        .then((r) => r.json())
        .then((d: { sales: FlashSale[] }) => alive && setSales(d.sales ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return <FlashSaleBanner sales={sales} />;
}
