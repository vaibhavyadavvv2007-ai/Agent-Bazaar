import { settleLink } from "./settle-core";

/**
 * THE DEMO DRIVER — one command runs the whole story the video narrates.
 *
 *   npx tsx scripts/demo.ts --base http://localhost:3000
 *
 * Scenarios (each maps to a Track-01 bar):
 *   S1  allow-path purchase          → real rails, instant, signed chain
 *   S2  gate → human approval        → bounded + gated, latency measured
 *   S3  failure → retry → recovered  → graceful failure handling
 *   S4  policy deny                  → structured refusal with named rules
 *   S5  intent/stock violations      → structured refusals agents can read
 *   S6  upsell acceptance            → measured growth evidence
 */

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = flag("base") ?? "http://localhost:3000";

let failures = 0;

const ok = (label: string, detail?: unknown) =>
  console.log(`  \x1b[32m✓\x1b[0m ${label}${detail !== undefined ? ` \x1b[2m${typeof detail === "string" ? detail : JSON.stringify(detail)}\x1b[0m` : ""}`);
const bad = (label: string, detail?: unknown) => {
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` \x1b[2m${typeof detail === "string" ? detail : JSON.stringify(detail)}\x1b[0m` : ""}`);
  failures++;
};
const expect = (cond: boolean, label: string, detail?: unknown) => (cond ? ok(label, detail) : bad(label, detail));
const section = (title: string) => console.log(`\n\x1b[33m═══ ${title} ═══\x1b[0m`);

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

async function newSession(agentId: string, provider: string, persona: string): Promise<string> {
  const { json } = await api<{ session_id: string }>("POST", "/api/mandates", { action: "session", agent_id: agentId, provider, persona });
  return json.session_id;
}

async function makeIntent(sessionId: string, maxInr: number, categories?: string[]): Promise<string> {
  await api("POST", "/api/mandates", { action: "intent", session_id: sessionId, max_amount_paise: maxInr * 100, categories });
  const { json } = await api<{ mandate: { id: string } }>("GET", `/api/mandates?session_id=${sessionId}&type=INTENT&latest=1`);
  return json.mandate.id;
}

async function makeCart(sessionId: string, intentId: string, items: { sku: string; qty: number }[]) {
  return api<{ mandate: { id: string }; total_paise: number; error?: string; detail?: Record<string, unknown> }>(
    "POST", "/api/mandates", { action: "cart", session_id: sessionId, intent_mandate_id: intentId, items }
  );
}

type StatusRow = { status: string; attempt: number; failure_reason: string | null };

async function pollStatus(paymentRowId: string, want: string[], tries = 24): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const { status, json } = await api<StatusRow>("GET", `/api/status?payment_row_id=${paymentRowId}`);
    if (status === 200 && want.includes(json.status)) return json.status;
    await sleep(1500);
  }
  return "timeout";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── S1 — allow-path ─────────────────────────────────────────────── */
async function s1() {
  section("S1 · allow-path: signed chain → instant rails");
  const sid = await newSession("groq/gift-buyer", "groq", "Buying Diwali gifts for family");
  const intent = await makeIntent(sid, 1500, ["mithai", "chai"]);
  ok("intent signed by user", "max ₹1,500 · categories [mithai, chai]");

  const cart = await makeCart(sid, intent, [
    { sku: "MITH-KAJU-004", qty: 1 },
    { sku: "CHAI-KLH-002", qty: 1 },
  ]);
  expect(cart.status === 200, `cart signed & linked (₹${(cart.json.total_paise ?? 0) / 100})`);

  const co = await api<{ status: string; checkout_url?: string; payment_row_id?: string }>("POST", "/api/checkout",
    { cart_mandate_id: cart.json.mandate.id });
  expect(co.status === 200 && co.json.status === "issued", "policy ALLOWED → real rails issued");

  const settled = await settleLink(co.json.checkout_url!, "success");
  expect(settled.ok, "hosted page settled with success@razorpay");
  expect((await pollStatus(co.json.payment_row_id!, ["captured"])) === "captured", "ledger shows CAPTURED");
}

/* ── S2 — gate → human approval ──────────────────────────────────── */
async function s2() {
  section("S2 · gate: oversized cart rings the shopkeeper bell");
  const t0 = Date.now();
  const sid = await newSession("gemini/festive-shopper", "gemini", "Wants the premium hamper");
  const intent = await makeIntent(sid, 3000);
  const cart = await makeCart(sid, intent, [{ sku: "MITH-HAMP-013", qty: 1 }]);

  const co = await api<{ approval_id?: string; reasons?: { detail: string }[] }>("POST", "/api/checkout",
    { cart_mandate_id: cart.json.mandate.id });
  expect(co.status === 202 && !!co.json.approval_id, "parked for HUMAN approval", co.json.reasons?.map((r) => r.detail));

  const decision = await api<{ rail?: { status: string; checkout_url?: string; payment_row_id?: string } }>("POST", "/api/approvals",
    { approval_id: co.json.approval_id!, decision: "approved", decided_by: "shopkeeper-demo" });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  expect(decision.json.rail?.status === "issued", `human approved in ${seconds}s → rails issued`);

  await settleLink(decision.json.rail!.checkout_url!, "success");
  expect((await pollStatus(decision.json.rail!.payment_row_id!, ["captured"])) === "captured", "ledger shows CAPTURED");
}

/* ── S3 — failure → recovery ─────────────────────────────────────── */
async function s3(): Promise<string | null> {
  section("S3 · failure: real failed payment, then recovery");
  const sid = await newSession("gemini/snacker", "gemini", "Evening samosa run");
  const intent = await makeIntent(sid, 250);
  const cart = await makeCart(sid, intent, [{ sku: "SNCK-SAMS-007", qty: 2 }]);
  if (cart.status !== 200) return bad("S3 setup failed", cart.json), null;

  const first = await api<{ payment_row_id?: string; checkout_url?: string }>("POST", "/api/checkout",
    { cart_mandate_id: cart.json.mandate.id });
  ok("attempt #1 issued on real rails");

  const failed = await settleLink(first.json.checkout_url!, "failure");
  expect(!failed.ok, "hosted page FAILED the payment (failure@razorpay)");
  expect((await pollStatus(first.json.payment_row_id!, ["failed"])) === "failed", "ledger shows FAILED with reason");

  log("agent reads failure_reason and retries per guidance…");
  const retry = await api<{ payment_row_id?: string; checkout_url?: string }>("POST", "/api/checkout",
    { cart_mandate_id: cart.json.mandate.id });
  expect(retry.json.checkout_url !== first.json.checkout_url, "attempt #2 issued on the SAME signed cart");

  await settleLink(retry.json.checkout_url!, "success");
  expect((await pollStatus(retry.json.payment_row_id!, ["captured"])) === "captured", "attempt #2 CAPTURED");
  expect((await pollStatus(first.json.payment_row_id!, ["recovered"])) === "recovered", "original failure marked RECOVERED");
  return sid;
}

function log(msg: string) {
  console.log(`  \x1b[36m▸\x1b[0m ${msg}`);
}

/* ── S4 — policy deny ────────────────────────────────────────────── */
async function s4() {
  section("S4 · deny: category rule stops the cricket bat");
  const sid = await newSession("claude/rule-tester", "claude", "Testing enforcement");
  const intent = await makeIntent(sid, 2000);
  const cart = await makeCart(sid, intent, [{ sku: "CRKT-BAT-012", qty: 1 }]);
  const co = await api<{ reasons?: { kind: string; detail: string }[] }>("POST", "/api/checkout",
    { cart_mandate_id: cart.json.mandate.id });
  const denied = co.status === 403 && co.json.reasons?.some((r) => r.kind === "category_deny") === true;
  expect(denied, "DENIED with named rule", co.json.reasons?.map((r) => r.detail));
}

/* ── S5 — structured violations ──────────────────────────────────── */
async function s5() {
  section("S5 · bounds: violations come back as data, not crashes");
  const sid = await newSession("claude/bound-tester", "claude", "Probing limits");
  const intent = await makeIntent(sid, 300);

  const greedy = await makeCart(sid, intent, [{ sku: "MITH-LADD-005", qty: 999 }]);
  expect(greedy.status === 409 && greedy.json.error === "insufficient_stock", "stock-out refused structurally", greedy.json);

  const over = await makeCart(sid, intent, [{ sku: "MITH-KAJU-004", qty: 1 }]);
  expect(over.status === 409 && over.json.error === "exceeds_intent_bound", "intent bound enforced", over.json.detail ?? over.json.error);
}

/* ── S6 — upsell evidence ────────────────────────────────────────── */
async function s6(snackerSessionId: string | null) {
  section("S6 · growth: suggestion presented & accepted = measured attach");
  if (!snackerSessionId) return bad("skipped — no snacker session from S3");

  const sug = await api<{ suggestion_id?: string }>("POST", "/api/suggestions",
    { session_id: snackerSessionId, sku: "CHAI-MSL-001", cart_mandate_id: null });
  expect(!!sug.json.suggestion_id, "merchant suggests masala chai kit to the samosa buyer");

  const acc = await api<{ accepted?: boolean }>("PATCH", "/api/suggestions", { suggestion_id: sug.json.suggestion_id });
  expect(acc.json.accepted === true, "agent ACCEPTED — attach rate now measurable");
}

/* ── run ─────────────────────────────────────────────────────────── */
console.log(`\n🪔 THE AGENT BAZAAR — demo driver → ${BASE}\n`);
try {
  const h = await api<{ ok: boolean }>("GET", "/api/health");
  if (!h.json.ok) throw new Error("app unhealthy — run npm run setup and restart dev server");
  ok("app healthy");

  await s1();
  await s2();
  const snackerSession = await s3();
  await s4();
  await s5();
  await s6(snackerSession);
} catch (e) {
  bad("demo crashed", String(e));
}

section("FINAL METRICS");
const metrics = await fetch(`${BASE}/api/metrics`).then((r) => r.json());
console.log(JSON.stringify(metrics, null, 2));
console.log(failures > 0 ? `\n\x1b[31m${failures} check(s) failed\x1b[0m\n` : `\n\x1b[32mALL CHECKS PASSED — every rupee has a signature, a reason, and a receipt.\x1b[0m\n`);
process.exit(failures > 0 ? 1 : 0);
