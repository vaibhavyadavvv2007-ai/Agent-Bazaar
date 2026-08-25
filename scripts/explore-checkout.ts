import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/** Probe OUR checkout page: console logs, modal state, screenshots. */
const rowId = process.argv[2];
if (!rowId) { console.error("usage: tsx scripts/explore-checkout.ts <payment_row_id>"); process.exit(1); }

mkdirSync("./shots", { recursive: true });
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on("console", (m) => console.log("[page console]", m.type(), m.text().slice(0, 160)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto(`http://localhost:3002/checkout/${rowId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(6_000);
await page.screenshot({ path: "./shots/our-checkout.png", fullPage: true }).catch((e) => console.log("shot failed", String(e).slice(0, 80)));

const frames = page.frames().map((f) => f.url().slice(0, 100));
console.log("frames:", JSON.stringify(frames, null, 1));
const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
console.log("body:", bodyText.replace(/\s+/g, " "));

await page.waitForTimeout(4_000);
await page.screenshot({ path: "./shots/our-checkout-late.png", fullPage: true }).catch(() => {});
await browser.close();
