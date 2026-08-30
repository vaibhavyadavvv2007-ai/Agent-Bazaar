"use client";

import Link from "next/link";
import GazetteNav from "./GazetteNav";

/**
 * SHARED GAZETTE COMPONENTS — the one-product layer.
 *
 * Every page renders states through StatusStamp, KPIs through MetricCard,
 * headers through PageHeader/SectionHeader and lists through FilterBar, so
 * the five pages read as one publication rather than five stylesheets.
 *
 * Status is NEVER color alone: each stamp pairs a glyph, a word and a tone.
 */

export type StampState = "ok" | "warn" | "bad" | "info" | "neutral";

const STAMP_GLYPH: Record<StampState, string> = {
  ok: "✓",
  warn: "!",
  bad: "×",
  info: "●",
  neutral: "□",
};

const STAMP_CLASS: Record<StampState, string> = {
  ok: "plate plate-ok",
  warn: "plate plate-warn",
  bad: "plate plate-bad",
  info: "plate plate-info",
  neutral: "plate",
};

/** The editorial status stamp: glyph + word + tone, used identically everywhere. */
export function StatusStamp({
  state,
  children,
  className = "",
}: {
  state: StampState;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`${STAMP_CLASS[state]} ${className}`}>
      <span className="glyph" aria-hidden="true">{STAMP_GLYPH[state]}</span>
      {children}
    </span>
  );
}

/**
 * A KPI block that answers WHAT / HOW MUCH / IS IT GOOD — without inventing
 * comparisons. `count` is the evidence line ("13 / 51 decisions"); `note` is
 * the interpretation; optional `href` links to the page that explains it.
 */
export function MetricCard({
  label,
  value,
  count,
  note,
  state,
  href,
  linkLabel,
}: {
  label: string;
  value: string;
  count?: string;
  note?: string;
  state?: StampState;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="border-[1.5px] border-(--ink) bg-(--paper-deep) p-4">
      <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
        {label}
      </div>
      <div className="digits mt-1.5 text-3xl text-(--ink)">{value}</div>
      {count && (
        <div className="mt-1 font-clause text-xs text-(--ink)">{count}</div>
      )}
      {(note || href) && (
        <div className="mt-1.5 flex items-center gap-1.5 font-clause text-[11px] text-(--ink-soft)">
          {state && <StatusStamp state={state}>{state === "ok" ? "healthy" : state === "warn" ? "watch" : state === "bad" ? "attention" : ""}</StatusStamp>}
          {note}
          {href && (
            <Link href={href} className="underline decoration-(--rule-blue) underline-offset-2 hover:text-(--rule-blue)">
              {linkLabel ?? "details →"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Secondary-page masthead: wordmark home link, title, section nav, rules. */
export function PageHeader({
  title,
  kicker,
}: {
  title: string;
  kicker?: string;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-y-1 font-clause text-[11px] uppercase tracking-[0.18em] text-(--ink-soft)">
        <Link href="/" className="hover:text-(--ink)">The Agent Bazaar Gazette</Link>
        <span className="mode-stamp mode-stamp--test" role="status">
          <span className="dot" aria-hidden="true" />
          Test mode · ₹0·00
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-masthead text-2xl font-bold uppercase tracking-[0.04em] text-(--ink)">
            {title}
          </h1>
          {kicker && (
            <p className="mt-1 font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
              {kicker}
            </p>
          )}
        </div>
      </div>
      <div className="double-rule mt-3" aria-hidden="true" />
      <GazetteNav />
    </header>
  );
}

/** In-page section heading with its kicker and rule — same on every page. */
export function SectionHeader({
  title,
  kicker,
}: {
  title: string;
  kicker?: string;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="font-masthead text-sm uppercase tracking-[0.08em] text-(--ink)">
        {title}
      </h2>
      {kicker && (
        <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">
          {kicker}
        </span>
      )}
    </header>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

/** Editorial filter bar: clause buttons, active = inked, aria-pressed for machines. */
export function FilterBar<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`press min-h-6 border px-2.5 py-1 font-clause text-[11px] uppercase tracking-[0.1em] ${
              active
                ? "border-(--ink) bg-(--ink) text-(--paper)"
                : "border-(--paper-edge) bg-transparent text-(--ink-soft) hover:border-(--ink)"
            }`}
          >
            {o.label}
            {typeof o.count === "number" && <span className="ml-1 opacity-70">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
