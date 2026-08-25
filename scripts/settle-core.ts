import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Settlement step — the human verification moment, by design.
 *
 * Finding from the spike (documented in docs/ARCHITECTURE.md): Razorpay's
 * hosted surfaces embed device-integrity scoring (Sardine) that REFUSES to
 * let an automated browser complete a payment — a provably-valid contact
 * number is rejected the moment a bot types it. We stopped fighting this,
 * because it is the thesis: unsupervised automation SHOULD NOT move money.
 * AP2's Cart Mandate exists for exactly this moment; Razorpay's own agentic
 * UPI pilot is "consent-based authentication" — the human confirms on their
 * device.
 *
 * So the driver opens the hosted checkout on our storefront and a HUMAN
 * completes it (on camera for the video): UPI VPA `success@razorpay`
 * settles, `failure@razorpay` fails. Terminal truth is read from OUR page,
 * which mirrors the ledger (webhook + poll reconciler) — never the modal's
 * cosmetic state.
 */

export type SettleOutcome = "success" | "failure";

export async function settleLink(
  checkoutUrl: string,
  outcome: SettleOutcome,
  opts: { headless?: boolean; timeoutMs?: number } = {}
): Promise<{ ok: boolean; detail: string }> {
  const browser = await chromium.launch({ headless: opts.headless ?? false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.bringToFront();

    const vpa = outcome === "success" ? "success@razorpay" : "failure@razorpay";
    console.log(`
┌──────────────────────────────────────────────────────────────┐
│ 🛒 CHECKOUT OPEN — human verification step (Cart Mandate)    │
│ In the Razorpay window:                                      │
│   1. Mobile number: 9876543210   → Continue                  │
│   2. Choose UPI → enter VPA: ${vpa.padEnd(21)}│
│   3. Pay                                                     │
│ The ledger is watched automatically — no need to report back.│
└──────────────────────────────────────────────────────────────┘`);

    // Terminal truth = our page reflecting the ledger.
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const result = await Promise.race([
      page
        .getByText(/payment captured/i)
        .first()
        .waitFor({ state: "visible", timeout: timeoutMs })
        .then(() => ({ ok: true, detail: "ledger confirms captured" })),
      page
        .getByText(/payment failed/i)
        .first()
        .waitFor({ state: "visible", timeout: timeoutMs })
        .then(() => ({ ok: false, detail: "ledger confirms failed" })),
    ]);
    return result;
  } catch (e) {
    return fail(page, `driver error: ${String(e).slice(0, 200)}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function fail(page: Page, detail: string): Promise<{ ok: false; detail: string }> {
  try {
    mkdirSync("./shots", { recursive: true });
    const stamp = Date.now();
    await page.screenshot({ path: `./shots/settle-${stamp}.png`, fullPage: true });
    writeFileSync(`./shots/settle-${stamp}.html`, await page.content());
    console.error(`[settle] ${detail} — shot+dom saved to ./shots/settle-${stamp}.*`);
  } catch {
    console.error(`[settle] ${detail}`);
  }
  return { ok: false, detail };
}
