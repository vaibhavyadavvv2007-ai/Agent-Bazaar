import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusStamp } from "../../_components/gazette";

export const dynamic = "force-dynamic";

/**
 * THE TRANSACTION FILE — the audit detail view.
 *
 * One purchase, end to end, from the append-only tables:
 *   USER INTENT → CART → POLICY CHECK → [HUMAN APPROVAL] → [CAMPAIGN]
 *   → PAYMENT MANDATE → SETTLEMENT
 *
 * The route accepts a payments.id (from a receipt) or a mandate id (from the
 * shopkeeper's queue, where no payment may exist yet).
 */
type Row = Record<string, unknown>;

export default async function ReceiptDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Resolve the anchor: payment row first, else mandate id (queue case).
  let payment = (await db().execute({ sql: "SELECT * FROM payments WHERE id = ?", args: [id] })).rows[0] as Row | undefined;
  let paymentMandateId: string | undefined = payment ? String(payment.mandate_id) : undefined;

  if (!payment) {
    const byMandate = (await db().execute({ sql: "SELECT * FROM payments WHERE mandate_id = ? ORDER BY created_at DESC", args: [id] })).rows;
    if (byMandate.length > 0) {
      payment = byMandate[0] as Row;
      paymentMandateId = id;
    } else {
      const mandateExists = (await db().execute({ sql: "SELECT id FROM mandates WHERE id = ?", args: [id] })).rows[0];
      if (!mandateExists) notFound();
      paymentMandateId = id;
    }
  }

  const paymentMandateIdSafe = paymentMandateId!;

  const pm = (await db().execute({ sql: "SELECT * FROM mandates WHERE id = ?", args: [paymentMandateIdSafe] })).rows[0] as Row | undefined;
  if (!pm) notFound();

  const sessionId = String(pm.session_id);
  const cartId = jsonPath(pm.payload_json, "cart_mandate_id");
  const cart = cartId ? ((await db().execute({ sql: "SELECT * FROM mandates WHERE id = ?", args: [cartId] })).rows[0] as Row | undefined) : undefined;
  const intentId = cart ? jsonPath(cart.payload_json, "intent_mandate_id") : null;
  const intent = intentId ? ((await db().execute({ sql: "SELECT * FROM mandates WHERE id = ?", args: [intentId] })).rows[0] as Row | undefined) : undefined;

  const session = (await db().execute({ sql: "SELECT * FROM sessions WHERE id = ?", args: [sessionId] })).rows[0] as Row | undefined;
  const decisions = (await db().execute({ sql: "SELECT * FROM policy_decisions WHERE mandate_id = ? ORDER BY evaluated_at", args: [paymentMandateIdSafe] })).rows as Row[];
  const approvals = (await db().execute({ sql: "SELECT * FROM approvals WHERE mandate_id = ? ORDER BY requested_at", args: [paymentMandateIdSafe] })).rows as Row[];
  const campaignApps = cartId
    ? (await db().execute({
        sql: `SELECT ca.*, c.name AS campaign_name, c.description AS campaign_description
              FROM campaign_applications ca JOIN campaigns c ON c.id = ca.campaign_id
              WHERE ca.cart_mandate_id = ? ORDER BY ca.applied_at`,
        args: [cartId],
      })).rows as Row[]
    : [];
  const attempts = (await db().execute({ sql: "SELECT * FROM payments WHERE mandate_id = ? ORDER BY created_at", args: [paymentMandateIdSafe] })).rows as Row[];

  const intentPayload = intent ? JSON.parse(String(intent.payload_json)) : null;
  const cartPayload = cart ? JSON.parse(String(cart.payload_json)) : null;

  const amountPaise = payment ? Number(payment.amount_paise) : Number(jsonPath(pm.payload_json, "amount_paise") ?? 0);
  const finalStatus = payment ? String(payment.status) : "no payment issued";
  const settled = payment && ["captured", "recovered"].includes(finalStatus);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 min-h-screen">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline justify-between gap-y-1 font-clause text-[11px] uppercase tracking-[0.18em] text-(--ink-soft)">
        <Link href="/receipts" className="hover:text-(--ink)">Audit Trail</Link>
        <span className="mode-stamp mode-stamp--test" role="status">
          <span className="dot" aria-hidden="true" />
          Test mode · ₹0·00
        </span>
      </div>
      <h1 className="font-masthead mt-2 text-3xl uppercase tracking-[0.04em] text-(--ink)">
        The Transaction File
      </h1>
      <p className="mt-1 font-body text-[13px] text-(--ink-soft)">
        the full chain for one purchase — every step signed, recorded, and impossible to rewrite
      </p>
      <div className="double-rule mt-3" aria-hidden="true" />

      {/* ── Summary ───────────────────────────────────────────── */}
      <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Transaction summary">
        <div>
          <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Amount</div>
          <div className="digits mt-0.5 text-3xl text-(--ink)">{rupees(amountPaise)}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Settlement</span>
            <StatusStamp state={settled ? "ok" : finalStatus === "no payment issued" ? "neutral" : "warn"}>
              {finalStatus === "no payment issued" ? "not issued" : finalStatus}
            </StatusStamp>
          </div>
          {decisions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Policy</span>
              <StatusStamp state={verdictState(String(decisions[decisions.length - 1].verdict))}>
                {String(decisions[decisions.length - 1].verdict)}
              </StatusStamp>
            </div>
          )}
          {campaignApps.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">Campaign</span>
              <span className="font-clause text-xs text-(--ink)">{String(campaignApps[0].campaign_name)}</span>
            </div>
          )}
        </div>
        {session && (
          <p className="fig">
            <span className="pointer" aria-hidden="true" />
            agent {String(session.agent_id)} · provider {String(session.provider)}
          </p>
        )}
      </section>

      {/* ── The chain ─────────────────────────────────────────── */}
      <ol className="mt-8 space-y-0" aria-label="Transaction chain">
        <ChainStep
          no="I"
          title="User Intent"
          stamp={<StatusStamp state="info">signed by user</StatusStamp>}
          time={intent ? epoch(intent.iat) : "—"}
          body={intent && intentPayload ? (
            <>
              <p className="font-body text-[13px] text-(--ink-soft)">
                The user bound the agent: spend at most{" "}
                <b className="digits">{rupees(Number(intentPayload.max_amount_paise ?? 0))}</b>
                {intentPayload.categories?.length > 0 && <> in {intentPayload.categories.join(", ")} only</>}.
              </p>
              <p className="fig mt-1.5 break-all"><span className="pointer" aria-hidden="true" />hash {String(intent.hash).slice(0, 24)}…</p>
            </>
          ) : <p className="font-body text-[13px] text-(--ink-faint)">intent mandate not found</p>}
        />

        <ChainStep
          no="II"
          title="Cart"
          stamp={<StatusStamp state="info">signed by agent</StatusStamp>}
          time={cart ? epoch(cart.iat) : "—"}
          body={cart && cartPayload ? (
            <>
              <ul className="space-y-0.5">
                {(cartPayload.items ?? []).map((i: { sku: string; qty: number }, idx: number) => (
                  <li key={idx} className="flex justify-between font-clause text-xs text-(--ink)">
                    <span>{i.qty}× {i.sku}</span>
                  </li>
                ))}
              </ul>
              <p className="font-body text-[13px] text-(--ink-soft) mt-1.5">
                Total <b className="digits">{rupees(Number(cartPayload.total_paise ?? 0))}</b>
                {cartPayload.categories?.length > 0 && <> · {cartPayload.categories.join(", ")}</>}
              </p>
              <p className="fig mt-1.5 break-all"><span className="pointer" aria-hidden="true" />hash {String(cart.hash).slice(0, 24)}…</p>
            </>
          ) : <p className="font-body text-[13px] text-(--ink-faint)">cart mandate not found</p>}
        />

        <ChainStep
          no="III"
          title="Policy Check"
          stamp={
            decisions.length > 0 ? (
              <StatusStamp state={verdictState(String(decisions[decisions.length - 1].verdict))}>
                {String(decisions[decisions.length - 1].verdict)}
              </StatusStamp>
            ) : <StatusStamp state="neutral">no decision</StatusStamp>
          }
          time={decisions.length > 0 ? when(String(decisions[decisions.length - 1].evaluated_at)) : "—"}
          body={decisions.length > 0 ? (
            <>
              {decisions.map((d, i) => {
                const reasons = safeParseArr(String(d.reasons_json));
                return (
                  <div key={i} className="mt-1 first:mt-0">
                    <p className="font-clause text-xs text-(--ink) uppercase tracking-wider">verdict: {String(d.verdict)}</p>
                    {reasons.map((r: { rule_id?: string; kind?: string; detail?: string }, j: number) => (
                      <p key={j} className="font-body text-[13px] text-(--ink-soft)">
                        <span className="fig" aria-hidden="true">▸ </span>
                        {/* The violation points back at the wall it hit. */}
                        {r.rule_id ? (
                          <a href="/#standing-orders" className="underline decoration-(--ink-soft)/40 underline-offset-2 hover:text-(--ink)">
                            {r.detail}
                          </a>
                        ) : (
                          r.detail
                        )}
                        {r.kind && <span className="fig ml-1">[{r.kind}]</span>}
                      </p>
                    ))}
                  </div>
                );
              })}
            </>
          ) : <p className="font-body text-[13px] text-(--ink-faint)">no policy decision recorded</p>}
        />

        {approvals.length > 0 && (
          <ChainStep
            no="IV"
            title="Human Approval"
            stamp={
              <StatusStamp state={approvals[approvals.length - 1].outcome === "approved" ? "ok" : "bad"}>
                {String(approvals[approvals.length - 1].outcome)}
              </StatusStamp>
            }
            time={when(String(approvals[approvals.length - 1].requested_at))}
            body={approvals.map((a, i) => {
              // Some approval reasons are stored as raw JSON — typeset the
              // details, never print the serialization.
              const reasons = safeParseArr(String(a.reason));
              return (
                <div key={i} className="mt-1 first:mt-0">
                  {reasons.map((r, j) => (
                    <p key={j} className="font-body text-[13px] text-(--ink-soft)">
                      <span className="fig" aria-hidden="true">▸ </span>{r.detail}
                    </p>
                  ))}
                  <p className="font-clause text-[11px] uppercase tracking-wider text-(--ink-faint) mt-0.5">
                    {a.outcome ? `${String(a.outcome)} by ${String(a.decided_by ?? "shopkeeper")}` : "still undecided"}
                  </p>
                </div>
              );
            })}
          />
        )}

        {campaignApps.length > 0 && (
          <ChainStep
            no={approvals.length > 0 ? "V" : "IV"}
            title="Campaign"
            stamp={<StatusStamp state="ok">applied</StatusStamp>}
            time={when(String(campaignApps[0].applied_at))}
            body={campaignApps.map((ca, i) => (
              <p key={i} className="font-body text-[13px] text-(--ink-soft)">
                <b className="text-(--ink)">{String(ca.campaign_name)}</b> — {String(ca.campaign_description)}
                {" "}took off <b className="digits">{rupees(Number(ca.discount_paise))}</b>
                {" "}(final {rupees(Number(ca.final_paise))}).
              </p>
            ))}
          />
        )}

        <ChainStep
          no={approvals.length > 0 ? (campaignApps.length > 0 ? "VI" : "V") : campaignApps.length > 0 ? "V" : "IV"}
          title="Payment Mandate"
          stamp={<StatusStamp state="info">signed by merchant</StatusStamp>}
          time={epoch(pm.iat)}
          body={
            <>
              <p className="font-body text-[13px] text-(--ink-soft)">
                The merchant signed the price: <b className="digits">{rupees(Number(jsonPath(pm.payload_json, "amount_paise")) || amountPaise)}</b>.
              </p>
              <p className="fig mt-1.5 break-all"><span className="pointer" aria-hidden="true" />hash {String(pm.hash).slice(0, 24)}… · sig {String(pm.sig).slice(0, 20)}…</p>
            </>
          }
        />

        <ChainStep
          no={approvals.length > 0 ? (campaignApps.length > 0 ? "VII" : "VI") : campaignApps.length > 0 ? "VI" : "V"}
          title="Settlement"
          stamp={
            settled ? <StatusStamp state="ok">{finalStatus === "recovered" ? "recovered" : "captured"}</StatusStamp>
              : attempts.length > 0 ? <StatusStamp state="warn">{finalStatus}</StatusStamp>
              : <StatusStamp state="neutral">not issued</StatusStamp>
          }
          time={payment ? when(String(payment.updated_at ?? payment.created_at)) : "—"}
          body={attempts.length === 0 ? (
            <p className="font-body text-[13px] text-(--ink-faint)">
              No rail was issued for this mandate{approvals.some((a) => !a.outcome) ? " — the approval is still open in the shopkeeper's queue." : "."}
            </p>
          ) : (
            attempts.map((a, i) => (
              <div key={i} className="mt-1.5 first:mt-0 border-b border-dashed border-(--paper-edge) pb-1.5 last:border-b-0 last:pb-0">
                <p className="font-clause text-xs text-(--ink)">
                  <span className="text-(--ink-soft)">attempt {String(a.attempt)}</span>{" · "}
                  <span className={String(a.status) === "captured" || String(a.status) === "recovered" ? "text-(--ok-ink)" : String(a.status) === "failed" ? "text-(--bad-ink)" : "text-(--warn-ink)"}>
                    {String(a.status)}
                  </span>
                  {a.failure_reason ? <span className="text-(--ink-soft)"> — {String(a.failure_reason)}</span> : null}
                </p>
                <p className="fig mt-0.5 break-all">
                  <span className="pointer" aria-hidden="true" />
                  order {String(a.rzp_order_id || "—")} · payment {String(a.rzp_payment_id || "—")}
                </p>
              </div>
            ))
          )}
        />
      </ol>

      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Mandates and events are append-only — this file cannot be rewritten, only appended to.
        </p>
      </footer>
    </main>
  );
}

/* ── helpers ──────────────────────────────────────────────────── */

/** Money always carries its paise: ₹1,174 or ₹2,378.30 — never ₹2,378.3. */
function rupees(paise: number): string {
  const v = paise / 100;
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function jsonPath(json: unknown, key: string): string | null {
  try {
    const v = JSON.parse(String(json))[key];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

function safeParseArr(s: string): { rule_id?: string; kind?: string; detail?: string }[] {
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v;
    // A single reason object — normalize to the same shape.
    if (v && typeof v === "object" && "detail" in v) return [v];
    return [{ detail: s }];
  } catch {
    return [{ detail: s }];
  }
}

function verdictState(v: string): "ok" | "warn" | "bad" {
  return v === "allow" ? "ok" : v === "gate" ? "warn" : "bad";
}

function epoch(iat: unknown): string {
  const n = Number(iat);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function when(utc: string): string {
  try {
    return new Date(utc + "Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return utc;
  }
}

function ChainStep(props: {
  no: string;
  title: string;
  stamp: React.ReactNode;
  time: string;
  body: React.ReactNode;
}) {
  return (
    <li className="relative border-l-[1.5px] border-(--ink-soft) pl-6 pb-7 last:pb-0">
      {/* node marker on the chain line */}
      <span
        className="absolute -left-[5px] top-1.5 h-[9px] w-[9px] border-[1.5px] border-(--ink) bg-(--paper)"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-clause text-[11px] font-bold uppercase tracking-[0.14em] text-(--ink-faint)">
            Step {props.no}
          </span>
          <h2 className="font-masthead text-[15px] uppercase tracking-[0.04em] text-(--ink)">{props.title}</h2>
        </div>
        {props.stamp}
      </div>
      <p className="fig mt-0.5"><span className="pointer" aria-hidden="true" />{props.time}</p>
      <div className="mt-1.5">{props.body}</div>
    </li>
  );
}
