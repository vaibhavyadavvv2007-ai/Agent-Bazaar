import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Agent Bazaar Gazette",
  description:
    "The official record of autonomous spending: AI agents shop with real (test-mode) money, every rupee notified, bounded and sealed. Razorpay AI Buildathon Track 01.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. webcrx-*) inject
          attributes on <html> before hydration; without this, React warns on
          every load for extension users. Scoped to <html> only. */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {/*
          DESIGN CONTRACT — The Gazette of Autonomous Spending (seed 064d6f79, code-led)
          THESIS: Agent commerce rendered as the official record it aspires to be —
          every mandate a numbered notification, every gate a standing order, every
          capture sealed — refusing the category-default dark neon dashboard.
          OWN-WORLD: aged gazette paper #f4eeda, ink #1c1a17, seal red #b3282d,
          security-thread gold #b98a2f, ledger-rule blue #2c4a7c; Spectral masthead
          + body, Courier Prime serials; double-rule boxes, rubber-stamp seals,
          security-thread bands, marginal Fig. annotations.
          STORY: the judge understands in ten seconds that this store PUBLISHES its
          spending — live notifications print, agents appear on the notice board,
          standing orders bind every cart — and clicks nothing to verify it.
          FIRST VIEWPORT: masthead band (name, "being the official record of
          autonomous spending", notification no., date, test-mode price line) over
          a double rule; beneath in three gazette columns: PUBLIC NOTICE BOARD
          (agents, annotated), NOTIFICATIONS (live numbered clauses, sealed),
          STANDING ORDERS (the walls, one drag re-typesets the clause); settlement
          totals as fixed-place instrument digits above the fold.
          FORM: grounded candidate 3 of 7 (RBI gazette world), seed 064d6f79;
          challengers busytown/nixie/specimen declined, each donating one named
          raise; settlement-sheet pick declined by user choice of the roll.
          FINISH: unreviewed and undocumented is unfinished; this build ends with
          the finish review, the verdict, DESIGN.md, and every shipping raster
          carrying its provenance.
        */}
        {children}
        <Toaster
          position="bottom-left"
          toastOptions={{
            className: "font-clause text-[12px] border-2 border-(--ink) bg-(--paper) text-(--ink) rounded-none shadow-[0_4px_16px_rgba(28,26,23,0.18)] p-3",
            style: { fontFamily: "'Courier Prime', monospace" }
          }}
        />
      </body>
    </html>
  );
}
