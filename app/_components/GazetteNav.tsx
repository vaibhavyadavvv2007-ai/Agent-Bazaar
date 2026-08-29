"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Gazette section rail. Editorial newspaper navigation — no sidebar, no
 * pills. The OPEN section is marked the way a broadsheet marks the page you
 * are reading: heavier ink, a rule under it, and aria-current for machines.
 */
const SECTIONS: { href: string; label: string; external?: boolean }[] = [
  { href: "/", label: "The Floor" },
  { href: "/dashboard", label: "Settlement summaries" },
  { href: "/approvals", label: "Summonses" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/receipts", label: "Audit Trail Receipts" },
  { href: "/api/catalog?format=agent", label: "Machine-readable catalog", external: true },
] as const;

export default function GazetteNav({ today }: { today: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="mt-1.5 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 font-clause text-[12px]"
      aria-label="Gazette sections"
    >
      <span className="text-(--ink-faint)">{today}</span>
      {SECTIONS.map((s) => {
        const active = !("external" in s) && pathname === s.href;
        if ("external" in s) {
          return (
            <a key={s.href} className="nav-link" href={s.href}>
              {s.label}
            </a>
          );
        }
        return (
          <Link
            key={s.href}
            href={s.href}
            className={active ? "nav-link nav-link--active" : "nav-link"}
            aria-current={active ? "page" : undefined}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
