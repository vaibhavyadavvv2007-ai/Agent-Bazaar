"use client";

import { useEffect, useState, useRef } from "react";
import { useBazaarStream } from "./EventFeedContext";

/** SETTLEMENT SUMMARY — instrument digits, seeded from the ledger. */
type Score = { captured: number; saved: number; blocked: number; handled: number };

export default function ShopkeeperHUD() {
  const { last } = useBazaarStream();
  const [score, setScore] = useState<Score>({ captured: 0, saved: 0, blocked: 0, handled: 0 });

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((m) => {
        setScore({
          captured: Math.round((m.money?.captured_paise ?? 0) / 100),
          saved: m.money?.recovered_count ?? 0,
          blocked: m.policy?.deny ?? 0,
          handled: m.human_in_loop?.approvals_granted ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const e of last) {
      if (!e.id || seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);

      if (e.type === "payment.captured") {
        const amt = Number(e.payload?.amount_paise ?? 0) / 100;
        setScore((s) => ({ ...s, captured: s.captured + amt }));
      } else if (e.type === "payment.recovered") {
        setScore((s) => ({ ...s, saved: s.saved + 1 }));
      } else if (e.type === "policy.deny") {
        setScore((s) => ({ ...s, blocked: s.blocked + 1 }));
      } else if (e.type === "approval.approved" || e.type === "approval.rejected") {
        setScore((s) => ({ ...s, handled: s.handled + 1 }));
      }
    }
  }, [last]);

  return (
    <div className="rule-box grid grid-cols-2 divide-x divide-(--paper-edge) sm:grid-cols-4">
      <Tile label="Money captured" value={score.captured} prefix="₹" tone="ok" />
      <Tile label="Failures recovered" value={score.saved} note="money saved" tone="ok" />
      <Tile label="Refusals issued" value={score.blocked} note="policy denies" tone="bad" />
      <Tile label="Summonses answered" value={score.handled} note="gate decisions" tone="warn" />
    </div>
  );
}

function Tile(props: {
  label: string;
  value: number;
  prefix?: string;
  note?: string;
  tone: "ink" | "ok" | "bad" | "warn";
}) {
  const color =
    props.tone === "ok"
      ? "text-(--ok)"
      : props.tone === "bad"
        ? "text-(--bad)"
        : props.tone === "warn"
          ? "text-(--warn)"
          : "text-(--ink)";
  const chars = String(Math.round(props.value)).split("");
  return (
    <div className="px-4 py-3">
      <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
        {props.label}
      </div>
      <div className={`digits mt-1 text-2xl ${color}`} aria-label={`${props.prefix ?? ""}${props.value}`}>
        {props.prefix && <span className="mr-0.5">{props.prefix}</span>}
        {chars.map((c, i) => (
          <span className="digit digit-roll" key={`${props.value}-${i}`}>
            {c}
          </span>
        ))}
      </div>
      {props.note && <div className="fig mt-0.5"><span className="pointer" aria-hidden="true" />{props.note}</div>}
    </div>
  );
}
