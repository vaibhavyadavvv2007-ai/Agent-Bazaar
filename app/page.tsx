import BazaarFloor from "./_components/BazaarFloor";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-(--bazaar-saffron)">
            Razorpay AI Buildathon · Track 01 · Agentic Commerce
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">The Agent Bazaar</h1>
          <p className="mt-2 max-w-2xl text-(--bazaar-ink-dim)">
            Real AI agents shop here with real (test-mode) money rails. Every rupee they move is{" "}
            <span className="text-(--bazaar-ink)">explainable</span> — signed mandate chain,{" "}
            <span className="text-(--bazaar-ink)">bounded</span> — policy engine,{" "}
            <span className="text-(--bazaar-ink)">gated</span> — human approvals. Watch it live below.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <a href="/dashboard" className="rounded-lg border border-(--bazaar-line) px-3 py-1.5 hover:border-(--bazaar-saffron)">
            📊 Dashboard
          </a>
          <a href="/approvals" className="rounded-lg border border-(--bazaar-line) px-3 py-1.5 hover:border-(--bazaar-marigold)">
            🔔 Approvals
          </a>
          <a href="/api/catalog?format=agent" className="rounded-lg border border-(--bazaar-line) px-3 py-1.5 hover:border-(--bazaar-blue)">
            🤖 Agent feed
          </a>
        </nav>
      </header>

      <BazaarFloor />

      <footer className="mt-10 flex flex-wrap gap-6 text-xs text-(--bazaar-ink-dim)">
        <span>test mode only · no real money</span>
        <a className="underline decoration-(--bazaar-line) underline-offset-4 hover:text-(--bazaar-ink)" href="/docs/ARCHITECTURE.md">architecture</a>
        <a className="underline decoration-(--bazaar-line) underline-offset-4 hover:text-(--bazaar-ink)" href="/docs/THREAT-MODEL.md">threat model</a>
        <a className="underline decoration-(--bazaar-line) underline-offset-4 hover:text-(--bazaar-ink)" href="/docs/LIMITATIONS.md">limitations</a>
      </footer>
    </main>
  );
}
