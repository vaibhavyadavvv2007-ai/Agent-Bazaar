import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Exploratory probe: issue one real payment link, open it, and dump what the
 * hosted page actually looks like (URL, screenshot, full HTML) so the
 * settlement driver can be written against reality.
 */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = flag("base") ?? "http://localhost:3001";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

const s = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: "explore/probe", provider: "rest" });
console.log("session:", s.session_id);
await api("POST", "/api/mandates", { action: "intent", session_id: s.session_id, max_amount_paise: 100000 });
const li = await api<{ mandate?: { id: string }; error?: unknown }>("GET", `/api/mandates?session_id=${s.session_id}&type=INTENT&latest=1`);
console.log("intent:", JSON.stringify(li).slice(0, 120));
const c = await api<{ mandate?: { id: string }; error?: unknown }>("POST", "/api/mandates",
  { action: "cart", session_id: s.session_id, intent_mandate_id: li.mandate!.id, items: [{ sku: "DECO-DIYA-009", qty: 1 }] });
console.log("cart:", JSON.stringify(c).slice(0, 160));
const co = await fetch(`${BASE}/api/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cart_mandate_id: c.mandate!.id }),
});
const coBody = (await co.json()) as Record<string, unknown>;
console.log("checkout http:", co.status, JSON.stringify(coBody).slice(0, 300));
if (!coBody.checkout_url) process.exit(1);
const checkoutUrl = String(coBody.checkout_url);

if (checkoutUrl === "") process.exit(1);

mkdirSync("./shots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(8000); // let SPA settle

console.log("final url:", page.url());
await page.screenshot({ path: "./shots/explore.png", fullPage: true }).catch(() => {});
writeFileSync("./shots/explore.html", await page.content());

// Inventory of interactive elements for selector design.
const inventory = await page.evaluate(() => {
  const grab = (el: Element) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").trim().slice(0, 60),
    id: el.id || undefined,
    cls: typeof el.className === "string" ? el.className.slice(0, 80) : undefined,
    type: (el as HTMLInputElement).type || undefined,
    placeholder: (el as HTMLInputElement).placeholder || undefined,
    name: (el as HTMLInputElement).name || undefined,
  });
  return {
    buttons: [...document.querySelectorAll("button, [role=button], input[type=submit]")].map(grab),
    inputs: [...document.querySelectorAll("input, textarea")].map(grab),
    labels: [...document.querySelectorAll("label")].map((l) => (l.textContent ?? "").trim().slice(0, 60)),
  };
});
writeFileSync("./shots/explore-inventory.json", JSON.stringify(inventory, null, 2));
console.log("buttons:", JSON.stringify(inventory.buttons.slice(0, 12), null, 1));
console.log("inputs:", JSON.stringify(inventory.inputs.slice(0, 8), null, 1));

await browser.close();
