import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/** Dump every frame + input state after typing, to see exactly what the field holds. */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = flag("base") ?? "http://localhost:3000";

async function api<T>(method: string, path: string, body?: unknown): Promise<T & Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return (await res.json()) as T & Record<string, unknown>;
}

const s = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: "explore/frame", provider: "rest" });
await api("POST", "/api/mandates", { action: "intent", session_id: s.session_id, max_amount_paise: 100000 });
const li = await api<{ mandate: { id: string } }>("GET", `/api/mandates?session_id=${s.session_id}&type=INTENT&latest=1`);
const c = await api<{ mandate: { id: string } }>("POST", "/api/mandates",
  { action: "cart", session_id: s.session_id, intent_mandate_id: li.mandate.id, items: [{ sku: "DECO-MARI-010", qty: 1 }] });
const co = await api<{ checkout_url?: string }>("POST", "/api/checkout", { cart_mandate_id: c.mandate.id });
if (!co.checkout_url) { console.error("no link", co); process.exit(1); }

mkdirSync("./shots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(co.checkout_url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(5000);

console.log("frames:", page.frames().map((f) => f.url().slice(0, 90)));
const rzpFrame = page.frames().find((f) => f.url().includes("api.razorpay.com"));
if (!rzpFrame) { console.error("no razorpay frame"); process.exit(1); }

const inputs = await rzpFrame.evaluate(() =>
  [...document.querySelectorAll("input, button")].map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: (el as HTMLInputElement).type ?? null,
    placeholder: (el as HTMLInputElement).placeholder ?? null,
    value: (el as HTMLInputElement).value ?? null,
    text: (el as HTMLElement).innerText?.slice(0, 30) ?? null,
  }))
);
console.log("BEFORE typing:", JSON.stringify(inputs, null, 1));

const mobileInput = rzpFrame.locator("input").first();
await mobileInput.click();
await page.waitForTimeout(300);
await mobileInput.pressSequentially("9876543210", { delay: 70 });
await page.waitForTimeout(1000);

const after = await rzpFrame.evaluate(() =>
  [...document.querySelectorAll("input")].map((el) => ({ placeholder: (el as HTMLInputElement).placeholder, value: (el as HTMLInputElement).value }))
);
console.log("AFTER typing:", JSON.stringify(after, null, 1));
await page.screenshot({ path: "./shots/frame-diag.png" }).catch(() => {});

await browser.close();
