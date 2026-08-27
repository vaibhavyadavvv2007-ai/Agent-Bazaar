"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md border-[1.5px] border-(--bazaar-ink) bg-(--bazaar-panel) p-8 text-center shadow-[4px_4px_0_var(--bazaar-ink)]">
        <h2 className="font-masthead text-2xl font-bold uppercase tracking-tight text-(--bazaar-red)">Page Error</h2>
        <p className="mt-4 font-clause text-sm text-(--bazaar-ink-dim)">
          A component on this page failed to render.
        </p>
        <div className="mt-4 border-t border-b border-(--bazaar-line) py-3 text-left">
          <pre className="overflow-x-auto font-clause text-[10px] text-(--bazaar-ink)">
            {error.message || "Unknown error occurred"}
          </pre>
        </div>
        <button
          onClick={() => reset()}
          className="mt-6 border-[1.5px] border-(--bazaar-ink) bg-transparent px-6 py-2 font-clause text-xs font-bold uppercase tracking-wider hover:bg-(--bazaar-ink) hover:text-(--paper)"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
