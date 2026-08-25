import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Step-by-step visual exploration of the hosted payment flow. Screenshots
 * every screen so the settlement driver can be written against reality.
 *
 *   npx tsx scripts/explore-flow.ts --base http://localhost:3000 [--vpa success@razorpay]
 */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = flag("base") ?? "http://localhost:3000";
const VPA = flag("vpa") ?? "success@razorpay";

async function api<T>(method: string, path: string, body?: unknown): Promise<T & Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T & Record<string, unknown>;
}

const s = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: "explore/flow", provider: "rest" });
await api("POST", "/api/mandates", { action: "intent", session_id: s.session_id, max_amount_paise: 100000 });
const li = await api<{ mandate: { id: string } }>("GET", `/api/mandates?session_id=${s.session_id}&type=INTENT&latest=1`);
const c = await api<{ mandate: { id: string } }>("POST", "/api/mandates",
  { action: "cart", session_id: s.session_id, intent_mandate_id: li.mandate.id, items: [{ sku: "SNCK-BANA-008", qty: 1 }] });
const co = await api<{ checkout_url?: string }>("POST", "/api/checkout", { cart_mandate_id: c.mandate.id });
if (!co.checkout_url) { console.error("no checkout_url", co); process.exit(1); }
console.log("link:", co.checkout_url);

mkdirSync("./shots", { recursive: true });
// Headed by default: Razorpay's fraud collector (Sardine) scores headless
// browsers, which can make client-side validation fail spuriously.
const browser = await chromium.launch({ headless: flag("headless") === "true" });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const shot = (n: string) => page.screenshot({ path: `./shots/flow-${n}.png`, fullPage: true }).catch(() => {});

await page.goto(co.checkout_url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(5000);
await shot("1-landing");
console.log("1: landed", page.url());

// Everything interactive lives inside Razorpay's cross-origin iframe.
const frame = page.frameLocator("iframe").first();

// Step 1: contact details (mobile number) — type like a human so the
// field's validators see real key events (fill() fires too early for them).
const mobile = frame.getByPlaceholder(/mobile number/i).first();
await mobile.waitFor({ state: "visible", timeout: 25_000 });
await mobile.click();
await page.waitForTimeout(400);
await mobile.pressSequentially("9876543210", { delay: 60 });
await mobile.press("Tab"); // blur so validation state settles
await page.waitForTimeout(1200);
await shot("2-mobile-filled");
await frame.getByRole("button", { name: /continue/i }).first().click();
await page.waitForTimeout(4000);
await shot("3-after-continue");
console.log("3: after continue");

// Step 2: method selection — try UPI
try {
  const upi = frame.getByText(/^upi\b|upi$/i).first();
  await upi.waitFor({ state: "visible", timeout: 10_000 });
  await upi.click();
  await page.waitForTimeout(2500);
  await shot("4-upi-selected");
  console.log("4: UPI selected");
} catch {
  console.log("4: no UPI text found — see flow-3-after-continue.png");
}

// Step 3: VPA — the only text input visible after choosing UPI
try {
  const vpa = frame.getByPlaceholder(/vpa|@|upi id|handle/i).first();
  await vpa.waitFor({ state: "visible", timeout: 8_000 });
  await vpa.fill(VPA);
  await shot("5-vpa-filled");
  console.log("5: VPA filled");
} catch {
  console.log("5: no VPA input found by placeholder — dumping inputs");
}

// Step 4: pay
try {
  await frame.getByRole("button", { name: /pay|submit|proceed/i }).first().click({ timeout: 8_000 });
  await page.waitForTimeout(9000);
  await shot("6-after-pay");
  console.log("6: after pay", page.url());
} catch (e) {
  console.log("6: pay click failed", String(e).slice(0, 120));
}

await browser.close();
console.log("done — inspect ./shots/flow-*.png");
