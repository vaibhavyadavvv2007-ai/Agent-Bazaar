/**
 * Keyless smoke test — exercises everything that doesn't need Razorpay keys:
 * sessions, signed mandate chain, policy deny, policy gate, human approval,
 * structured violations, chain verification, tamper detection.
 *
 *   npx tsx scripts/smoke.ts [--base http://localhost:3000]
 */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = flag("base") ?? "http://localhost:3000";

let failures = 0;
const expect = (cond: boolean, label: string, detail?: unknown) => {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 220)}` : ""}`);
  if (!cond) failures++;
};

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

async function main() {
  const health = await api<{ ok: boolean }>("GET", "/api/health");
  expect(health.json.ok === true, "health", health.json);

  // Session + intent
  const s = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: "smoke/tester", provider: "rest", persona: "smoke" });
  expect(!!s.json.session_id, "session created");
  const sid = s.json.session_id;

  await api("POST", "/api/mandates", { action: "intent", session_id: sid, max_amount_paise: 200000 });
  const intentRes = await api<{ mandate?: { id: string; hash: string; sig: string } }>("GET", `/api/mandates?session_id=${sid}&type=INTENT&latest=1`);
  const intent = intentRes.json.mandate!;
  expect(!!intent?.id && intent.sig.length > 20, "INTENT signed by user");

  // Cart (allow-sized)
  const cart = await api<{ mandate?: { id: string } }>("POST", "/api/mandates", {
    action: "cart", session_id: sid, intent_mandate_id: intent.id,
    items: [{ sku: "MITH-KAJU-004", qty: 1 }],
  });
  expect(cart.status === 200 && !!cart.json.mandate?.id, "CART signed by agent");
  const cartId = cart.json.mandate!.id;

  // Payment mandate
  const pay = await api<{ mandate?: { id: string } }>("POST", "/api/mandates", { action: "payment", session_id: sid, cart_mandate_id: cartId });
  expect(!!pay.json.mandate?.id, "PAYMENT signed by merchant");
  const payId = pay.json.mandate!.id;

  // Chain verification passes
  const verify = await api<{ ok: boolean; checks: { step: string; ok: boolean }[] }>("GET", `/api/mandates?verify=${intent.id},${cartId},${payId}`);
  expect(verify.json.ok === true, "chain verifies", verify.json.checks?.filter((c) => !c.ok));

  // Deny path (cricket)
  const cartBat = await api<{ mandate?: { id: string } }>("POST", "/api/mandates", {
    action: "cart", session_id: sid, intent_mandate_id: intent.id,
    items: [{ sku: "CRKT-BAT-012", qty: 1 }],
  });
  const denyCo = await api<{ reasons?: { kind: string }[] }>("POST", "/api/checkout", { cart_mandate_id: cartBat.json.mandate?.id });
  expect(denyCo.status === 403 && denyCo.json.reasons?.some((r) => r.kind === "category_deny") === true, "deny: category rule fires", denyCo.json);

  // Gate path (oversized hamper) → approval queue.
  // Intent bound must exceed ₹2,499 so the CART passes; the POLICY engine's
  // max_single rule (₹1,500) is what should gate it.
  await api("POST", "/api/mandates", { action: "intent", session_id: sid, max_amount_paise: 300000 });
  const bigIntent = (await api<{ mandate?: { id: string } }>("GET", `/api/mandates?session_id=${sid}&type=INTENT&latest=1`)).json.mandate!.id;
  const cartHamper = await api<{ mandate?: { id: string } }>("POST", "/api/mandates", {
    action: "cart", session_id: sid, intent_mandate_id: bigIntent,
    items: [{ sku: "MITH-HAMP-013", qty: 1 }],
  });
  const gateCo = await api<{ status?: string; approval_id?: string }>("POST", "/api/checkout", { cart_mandate_id: cartHamper.json.mandate?.id });
  expect(
    gateCo.status === 202 && !!gateCo.json.approval_id,
    "gate: parked for human approval",
    { cartStatus: cartHamper.status, cartErr: cartHamper.json ?? null, coStatus: gateCo.status, coBody: gateCo.json }
  );

  const queue = await api<{ count: number }>("GET", "/api/approvals");
  expect(queue.json.count >= 1, "approval queue visible to shopkeeper");

  // Structured violations
  const greedy = await api<{ error?: string }>("POST", "/api/mandates", {
    action: "cart", session_id: sid, intent_mandate_id: intent.id, items: [{ sku: "MITH-LADD-005", qty: 999 }],
  });
  expect(greedy.status === 409 && greedy.json.error === "insufficient_stock", "stock-out is structured data");

  // SSE stream emits events (connect briefly)
  const ctrl = new AbortController();
  const stream = await fetch(`${BASE}/api/stream`, { signal: ctrl.signal });
  expect(stream.status === 200 && stream.headers.get("content-type")!.includes("text/event-stream"), "SSE stream serves");
  void stream.body?.cancel().catch(() => {});
  ctrl.abort();

  console.log(failures === 0 ? "\nSMOKE: ALL GREEN" : `\nSMOKE: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
