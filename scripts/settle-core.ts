import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

/**
 * Settlement driver — completes a Razorpay-hosted payment link page using
 * test instruments.
 *
 * Why this exists: Razorpay (by design) has no headless payment-authorization
 * API. In test mode the hosted page accepts mock instruments:
 *   UPI VPA  success@razorpay  → payment succeeds
 *   UPI VPA  failure@razorpay  → payment fails (our recovery demo)
 *
 * The human-visible framing: AP2's Cart Mandate means the exact cart is
 * verified on the processor's own surface before money moves. On camera we
 * use the deliberate human click; in bulk runs this driver does it.
 */

export type SettleOutcome = "success" | "failure";

const VPAS: Record<SettleOutcome, string> = {
  success: "success@razorpay",
  failure: "failure@razorpay",
};

export async function settleLink(
  checkoutUrl: string,
  outcome: SettleOutcome,
  opts: { headless?: boolean } = {}
): Promise<{ ok: boolean; detail: string }> {
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  const page = await browser.newPage();
  try {
    await page.goto(checkoutUrl, { waitUntil: "networkidle", timeout: 45_000 });

    // Method selection — Razorpay's hosted pages differ between Checkout and
    // Payment Links; try the common shapes before giving up.
    if (!(await clickIfVisible(page, [/upi/i]))) {
      return fail(page, "could not find a UPI method option");
    }

    const vpaInput = page.getByPlaceholder(/vpa|upi id/i).first();
    await vpaInput.waitFor({ state: "visible", timeout: 15_000 });
    await vpaInput.fill(VPAS[outcome]);

    // Pay button (label varies: "Pay", "Pay ₹…", "Submit").
    if (!(await clickIfVisible(page, [/^pay( ₹|\b)/i, /submit/i, /proceed/i]))) {
      return fail(page, "could not find the pay button");
    }

    // Terminal state: success banner or failure message.
    const result = await Promise.race([
      page
        .getByText(/payment successful|payment done|paid successfully/i)
        .first()
        .waitFor({ state: "visible", timeout: 40_000 })
        .then(() => ({ ok: true, detail: "hosted page reported success" })),
      page
        .getByText(/payment failed|failed|declined/i)
        .first()
        .waitFor({ state: "visible", timeout: 40_000 })
        .then(() => ({ ok: false, detail: "hosted page reported failure" })),
    ]);
    return result;
  } catch (e) {
    return fail(page, `driver error: ${String(e)}`);
  } finally {
    await browser.close();
  }
}

async function clickIfVisible(page: Page, patterns: RegExp[]): Promise<boolean> {
  for (const pattern of patterns) {
    try {
      const el = page.getByText(pattern).first();
      await el.waitFor({ state: "visible", timeout: 6_000 });
      await el.click();
      return true;
    } catch {
      // try next pattern
    }
  }
  return false;
}

async function fail(page: Page, detail: string): Promise<{ ok: false; detail: string }> {
  mkdirSync("./shots", { recursive: true });
  await page.screenshot({ path: `./shots/settle-${Date.now()}.png`, fullPage: true });
  console.error(`[settle] ${detail} — screenshot saved to ./shots/`);
  return { ok: false, detail };
}
