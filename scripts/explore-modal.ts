import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Probe the Checkout modal's contact step: does its validator accept a typed
 * number from an automated browser? Screenshots every state so nothing is
 * guessed.
 */
const rowId = process.argv[2];
if (!rowId) { console.error("usage: tsx scripts/explore-modal.ts <payment_row_id>"); process.exit(1); }

mkdirSync("./shots", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  channel: "chrome", // real Chrome if installed — far less bot-like than Chromium
  args: ["--disable-blink-features=AutomationControlled"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = await ctx.newPage();

await page.goto(`http://localhost:3002/checkout/${rowId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(5_000);

const modal = page.frameLocator('iframe[src*="api.razorpay.com"]').first();

// Contact step: type the number like a human.
const mobile = modal.getByPlaceholder(/mobile number/i).first();
await mobile.waitFor({ state: "visible", timeout: 20_000 });
await mobile.click();
await page.waitForTimeout(300);
await mobile.pressSequentially("9876543210", { delay: 70 });
await page.waitForTimeout(600);
await page.screenshot({ path: "./shots/modal-1-typed.png" }).catch(() => {});

await modal.getByRole("button", { name: /continue/i }).first().click();
await page.waitForTimeout(3_500);
await page.screenshot({ path: "./shots/modal-2-after-continue.png" }).catch(() => {});

// Any validation error visible?
const errText = await modal.locator("text=/valid|invalid|error/i").allInnerTexts().catch(() => []);
console.log("error-ish texts:", JSON.stringify(errText));

// Method list visible?
const upiVisible = await modal.getByText(/upi/i).first().isVisible().catch(() => false);
console.log("UPI visible:", upiVisible);

await browser.close();
console.log("done — see shots/modal-*.png");
