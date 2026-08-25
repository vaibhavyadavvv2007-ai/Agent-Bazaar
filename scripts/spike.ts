import { settleLink } from "./settle-core";

/**
 * D2 SPIKE — prove the real money rail end-to-end on test mode:
 *   signed chain → policy allow → Razorpay order + payment link
 *   → hosted page settled by driver → poll reconciler confirms CAPTURED.
 *   Then: failure@razorpay → FAILED → retry on same cart → RECOVERED.
 *
 *   npx tsx scripts/spike.ts --base http://localhost:3001
 */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = flag("base") ?? "http://localhost:3001";
const HEADLESS = flag("headed") !== "true";

let failures = 0;
const ok = (l: string, d?: unknown) => console.log(`  \x1b[32m✓\x1b[0m ${l}${d !== undefined ? ` \x1b[2m${typeof d === "string" ? d : JSON.stringify(d)}\x1b[0m` : ""}`);
const bad = (l: string, d?: unknown) => { console.log(`  \x1b[31m✗\x1b[0m ${l}${d !== undefined ? ` \x1b[2m${JSON.stringify(d).slice(0, 300)}\x1b[0m` : ""}`); failures++; };
const expect = (c: boolean, l: string, d?: unknown) => (c ? ok(l, d) : bad(l, d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

async function pollStatus(rowId: string, want: string[], tries = 30): Promise<{ status: string; rzp_order_id: string | null }> {
  for (let i = 0; i < tries; i++) {
    const { status, json } = await api<{ status?: string; rzp_order_id?: string | null }>("GET", `/api/status?payment_row_id=${rowId}`);
    if (status === 200 && json.status && want.includes(json.status)) {
      return { status: json.status, rzp_order_id: json.rzp_order_id ?? null };
    }
    await sleep(2000);
  }
  return { status: "timeout", rzp_order_id: null };
}

async function buy(agentId: string, skus: { sku: string; qty: number }[], intentInr: number) {
  const s = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: agentId, provider: "rest", persona: "spike" });
  const intent = await api<{ mandate?: { id: string }; error?: string }>("POST", "/api/mandates",
    { action: "intent", session_id: s.json.session_id, max_amount_paise: intentInr * 100 });
  if (intent.status !== 200) throw new Error(`intent failed (${intent.status}): ${JSON.stringify(intent.json)}`);
  const li = await api<{ mandate?: { id: string }; error?: string }>("GET", `/api/mandates?session_id=${s.json.session_id}&type=INTENT&latest=1`);
  if (!li.json.mandate?.id) throw new Error(`intent lookup failed (${li.status}): ${JSON.stringify(li.json)}`);
  const c = await api<{ mandate?: { id: string }; total_paise?: number; error?: string }>("POST", "/api/mandates",
    { action: "cart", session_id: s.json.session_id, intent_mandate_id: li.json.mandate.id, items: skus });
  const cartId = c.json.mandate?.id;
  if (c.status !== 200 || !cartId) throw new Error(`cart failed: ${JSON.stringify(c.json)}`);
  return { sessionId: s.json.session_id, cartId, total: c.json.total_paise ?? 0 };
}

console.log("\n💸 D2 SPIKE — real test-mode rail\n");

/* ── A. allow → captured ─────────────────────────────────────── */
console.log("\x1b[33m═ A · allow-path → hosted settlement → CAPTURED ═\x1b[0m");
const buyA = await buy("spike/buyer-a", [{ sku: "SNCK-SAMS-007", qty: 2 }], 500);
const coA = await api<{ status: string; checkout_url?: string; payment_row_id?: string }>("POST", "/api/checkout", { cart_mandate_id: buyA.cartId });
expect(coA.json.status === "issued" && !!coA.json.checkout_url, "rails issued (order + payment link)", coA.json.checkout_url);

if (coA.json.checkout_url) {
  const settled = await settleLink(coA.json.checkout_url!, "success", { headless: HEADLESS });
  // Only trust the ledger-confirmed phrases — a driver crash also returns ok:false.
  expect(settled.detail.includes("ledger confirms"), "hosted page settled with success@razorpay", settled.detail);
}
const finalA = await pollStatus(coA.json.payment_row_id!, ["captured"]);
expect(finalA.status === "captured", `poll reconciler says ${finalA.status.toUpperCase()}`, finalA.rzp_order_id);

/* ── B. failure → retry → recovered ──────────────────────────── */
console.log("\n\x1b[33m═ B · failure-path → retry → RECOVERED ═\x1b[0m");
const buyB = await buy("spike/buyer-b", [{ sku: "CHAI-MSL-001", qty: 1 }], 500);
const coB1 = await api<{ payment_row_id?: string; checkout_url?: string }>("POST", "/api/checkout", { cart_mandate_id: buyB.cartId });
ok("attempt #1 issued");

const failedSettle = await settleLink(coB1.json.checkout_url!, "failure", { headless: HEADLESS });
expect(failedSettle.detail.includes("ledger confirms failed"), "hosted page FAILED it (failure@razorpay)", failedSettle.detail);
const failedState = await pollStatus(coB1.json.payment_row_id!, ["failed"]);
expect(failedState.status === "failed", `ledger shows ${failedState.status.toUpperCase()} with reason`);

const coB2 = await api<{ payment_row_id?: string; checkout_url?: string }>("POST", "/api/checkout", { cart_mandate_id: buyB.cartId });
ok("agent retried — attempt #2 issued");
await settleLink(coB2.json.checkout_url!, "success", { headless: HEADLESS });
const finalB2 = await pollStatus(coB2.json.payment_row_id!, ["captured"]);
expect(finalB2.status === "captured", `retry ${finalB2.status.toUpperCase()}`);
const finalB1 = await pollStatus(coB1.json.payment_row_id!, ["recovered"]);
expect(finalB1.status === "recovered", "original failure marked RECOVERED");

console.log(failures === 0 ? "\n\x1b[32mSPIKE COMPLETE — REAL RAILS WORK.\x1b[0m\n" : `\n\x1b[31mSPIKE: ${failures} failure(s)\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
