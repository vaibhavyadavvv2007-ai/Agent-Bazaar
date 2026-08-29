import { Street, BillBook } from "./_components/BazaarFloor";
import StreetRules from "./_components/StreetRules";
import ShopkeeperHUD from "./_components/ShopkeeperHUD";
import DispatchDrawer from "./_components/DispatchDrawer";
import AgentTranscript from "./_components/AgentTranscript";
import FlashSaleBannerWrapper from "./_components/FlashSaleBannerWrapper";
import GazetteNav from "./_components/GazetteNav";

export const dynamic = "force-dynamic";

export default function Home() {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-10 pt-5">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="text-center">
        <div className="flex flex-wrap items-center justify-between gap-y-1 font-clause text-[11px] uppercase tracking-[0.18em] text-(--ink-soft)">
          <span>No. AB-2026-27/084</span>
          <span className="normal-case tracking-normal">Razorpay AI Buildathon, Track 01: Agentic Commerce</span>
          {/* The mode plate: money-realness is the one status that must never
              be missed. Amber stamp when no real rupees can move. */}
          <span className="mode-stamp mode-stamp--test" role="status">
            <span className="dot" aria-hidden="true" />
            Test mode · ₹0·00
          </span>
        </div>
        <div className="security-thread-band mx-auto mt-2 max-w-3xl" aria-hidden="true" />
        <h1 className="font-masthead mt-3 text-4xl uppercase tracking-[0.04em] sm:text-5xl">
          The Agent Bazaar Gazette
        </h1>
        <p className="mt-1 text-sm italic text-(--ink-soft)">
          being the official record of autonomous spending at this establishment
        </p>
        <div className="mx-auto mt-3 max-w-3xl">
          <div className="double-rule" />
        </div>
        <GazetteNav today={today} />
      </header>

      {/* ── Flash Sale Banner ────────────────────────────────── */}
      <section className="mt-4" aria-label="Flash sales">
        <FlashSaleBannerWrapper />
      </section>

      {/* ── Settlement summary (instrument digits) ──────────────── */}
      <section className="mt-5" aria-label="Settlement summary">
        <ShopkeeperHUD />
      </section>

      {/* ── The three columns ───────────────────────────────────── */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Street />
          <StreetRules />
          <AgentTranscript />
        </div>
        <BillBook />
      </div>

      {/* ── Colophon ────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-(--paper-edge) pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p>
          Published by the Shopkeeper of the Agent Bazaar · test mode only, no real money ·
          {" "}
          <a className="underline decoration-(--rule-blue) underline-offset-2 hover:text-(--rule-blue)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noopener">
            architecture
          </a>{" "}
          ·{" "}
          <a className="underline decoration-(--rule-blue) underline-offset-2 hover:text-(--rule-blue)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/THREAT-MODEL.md" target="_blank" rel="noopener">
            threat model
          </a>{" "}
          ·{" "}
          <a className="underline decoration-(--rule-blue) underline-offset-2 hover:text-(--rule-blue)" href="https://github.com/vaibhavyadavvv2007-ai/Agent-Bazaar/blob/main/docs/LIMITATIONS.md" target="_blank" rel="noopener">
            limitations
          </a>
        </p>
        <p className="fig mt-1">
          <span className="pointer" aria-hidden="true" />
          Fig. 9: the colophon. Every rupee moved on this page has a notification number.
        </p>
      </footer>

      {/* ── Dispatch agent FAB + drawer ────────────────────────── */}
      <DispatchDrawer />
    </main>
  );
}
