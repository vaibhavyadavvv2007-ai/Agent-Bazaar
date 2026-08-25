"use client";

import { useEffect, useState } from "react";
import { useBazaarStream } from "./EventFeedContext";

/**
 * The shopkeeper's HUD — your score as governor of the street.
 * Seeds from the ledger, then ticks live off the event stream.
 */
export default function ShopkeeperHUD() {
  const { last } = useBazaarStream();
  const [score, setScore] = useState({ captured: 0, saved: 0, blocked: 0, handled: 0 });

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(
        (m: {
          money?: { captured_paise?: number; recovered_count?: number };
          policy?: { deny?: number };
          human_in_loop?: { approvals_granted?: number };
        }) =>
          setScore({
            captured: Math.round((m.money?.captured_paise ?? 0) / 100),
            saved: m.money?.recovered_count ?? 0,
            blocked: m.policy?.deny ?? 0,
            handled: m.human_in_loop?.approvals_granted ?? 0,
          })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    for (const e of last) {
      if (e.type === "payment.captured") setScore((s) => ({ ...s, captured: s.captured + Number(e.payload?.amount_paise ?? 0) / 100 }));
      else if (e.type === "payment.recovered") setScore((s) => ({ ...s, saved: s.saved + 1 }));
      else if (e.type === "policy.deny") setScore((s) => ({ ...s, blocked: s.blocked + 1 }));
      else if (e.type === "approval.approved" || e.type === "approval.rejected") setScore((s) => ({ ...s, handled: s.handled + 1 }));
    }
  }, [last]);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <HudTile label="Money captured" value={`₹${score.captured.toLocaleString("en-IN")}`} tone="good" />
      <HudTile label="Failures recovered" value={String(score.saved)} sub="money saved" tone="good" />
      <HudTile label="Scams blocked" value={String(score.blocked)} sub="policy denies" tone="bad" />
      <HudTile label="Bells answered" value={String(score.handled)} sub="your gate decisions" tone="warn" />
    </div>
  );
}

function HudTile(props: { label: string; value: string; sub?: string; tone: "good" | "warn" | "bad" }) {
  const color = props.tone === "good" ? "text-(--henna)" : props.tone === "warn" ? "text-(--marigold)" : "text-(--kumkum)";
  return (
    <div className="rounded-xl border border-(--stall-edge) bg-(--night-deep) px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-(--haldi)">{props.label}</div>
      <div className={`font-sign text-2xl leading-tight ${color}`}>{props.value}</div>
      {props.sub && <div className="text-[10px] text-(--haldi)">{props.sub}</div>}
    </div>
  );
}
