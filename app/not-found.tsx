import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-8 text-center shadow-[4px_4px_0_var(--bazaar-ink)]">
        <p className="font-clause text-xs font-bold uppercase tracking-[0.25em] text-(--bazaar-ink-dim)">The Agent Bazaar</p>
        <h1 className="font-masthead mt-4 text-2xl font-bold uppercase tracking-tight text-(--bazaar-red)">404 / Missing Page</h1>

        <div className="mt-6 font-clause text-sm font-bold text-(--bazaar-ink-dim)">
          <p>
            The record you are looking for has been misplaced, redacted, or never existed in the official ledger.
          </p>
        </div>

        <Link
          href="/"
          className="mt-8 inline-block border-[1.5px] border-(--bazaar-ink) bg-transparent px-6 py-2 font-clause text-xs font-bold uppercase tracking-wider hover:bg-(--bazaar-ink) hover:text-(--paper)"
        >
          Return to Floor
        </Link>
      </div>
    </main>
  );
}
