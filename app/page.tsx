import { Street, BillBook } from "./_components/BazaarFloor";
import StreetRules from "./_components/StreetRules";
import ShopkeeperHUD from "./_components/ShopkeeperHUD";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-receipt text-[11px] uppercase tracking-[0.3em] text-(--lantern)">
            Razorpay AI Buildathon · Track 01
          </p>
          <h1 className="font-sign mt-1 text-4xl tracking-tight">
            The Agent Bazaar
          </h1>
          <p className="mt-1 max-w-xl text-(--haldi)">
            You are the shopkeeper. AI agents shop your street with real (test-mode) money —
            every rupee signed, bounded, and gated. Set the walls. Answer the bell. Watch the bill book.
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <a href="/dashboard" className="rounded-lg border border-(--stall-edge) px-3 py-1.5 hover:border-(--lantern)">
            📊 Ledger stats
          </a>
          <a href="/approvals" className="rounded-lg border border-(--stall-edge) px-3 py-1.5 hover:border-(--marigold)">
            🔔 Queue
          </a>
          <a href="/api/catalog?format=agent" className="rounded-lg border border-(--stall-edge) px-3 py-1.5 hover:border-(--neel)">
            🤖 Agent feed
          </a>
        </nav>
      </header>

      <ShopkeeperHUD />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Street />
          <StreetRules />
        </div>
        <BillBook />
      </div>

      <footer className="mt-8 flex flex-wrap gap-5 text-xs text-(--haldi)">
        <span>test mode only · no real money</span>
        <a className="underline decoration-(--stall-edge) underline-offset-4 hover:text-(--chalk)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noopener">architecture</a>
        <a className="underline decoration-(--stall-edge) underline-offset-4 hover:text-(--chalk)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/THREAT-MODEL.md" target="_blank" rel="noopener">threat model</a>
        <a className="underline decoration-(--stall-edge) underline-offset-4 hover:text-(--chalk)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/LIMITATIONS.md" target="_blank" rel="noopener">limitations</a>
      </footer>
    </main>
  );
}
