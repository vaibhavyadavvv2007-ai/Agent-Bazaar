import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  createIntentMandate,
  createCartMandate,
  createPaymentMandate,
  verifyChain,
  PipelineError,
} from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Mandate chain REST surface.
 *
 * POST /api/mandates  { action: "session", agent_id, provider, persona?, budget_paise? }
 *                     { action: "intent",  session_id, max_amount_paise, categories?, note? }
 *                     { action: "cart",    session_id, intent_mandate_id, items: [{sku, qty}] }
 *                     { action: "payment", session_id, cart_mandate_id }
 *
 * GET  /api/mandates?verify=<intentId>,<cartId>,<paymentId>   → chain verification report
 */
type Body = {
  action: "session" | "intent" | "cart" | "payment";
  session_id?: string;
  agent_id?: string;
  provider?: string;
  persona?: string;
  budget_paise?: number;
  max_amount_paise?: number;
  categories?: string[];
  note?: string;
  intent_mandate_id?: string;
  cart_mandate_id?: string;
  items?: { sku: string; qty: number }[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "session": {
        if (!body.agent_id || !body.provider) {
          return NextResponse.json({ error: "agent_id and provider are required" }, { status: 400 });
        }
        const id = randomUUID();
        await db().execute({
          sql: "INSERT INTO sessions (id, agent_id, provider, persona, budget_paise) VALUES (?, ?, ?, ?, ?)",
          args: [id, body.agent_id, body.provider, body.persona ?? "", body.budget_paise ?? 0],
        });
        return NextResponse.json({ session_id: id });
      }

      case "intent": {
        require(body.session_id, body.max_amount_paise);
        const m = await createIntentMandate(body.session_id!, {
          max_amount_paise: Number(body.max_amount_paise),
          categories: body.categories,
          note: body.note,
        });
        return NextResponse.json({ mandate: publicMandate(m) });
      }

      case "cart": {
        require(body.session_id, body.intent_mandate_id, body.items);
        const result = await createCartMandate(
          body.session_id!,
          body.intent_mandate_id!,
          body.items!.map((i) => ({ sku: String(i.sku), qty: Number(i.qty) }))
        );
        if (!result.ok) {
          // Structured refusal — an agent can read this and re-propose.
          return NextResponse.json({ error: result.reason, detail: result.detail }, { status: 409 });
        }
        return NextResponse.json({ mandate: publicMandate(result.mandate), total_paise: result.total_paise });
      }

      case "payment": {
        require(body.session_id, body.cart_mandate_id);
        const m = await createPaymentMandate(body.session_id!, body.cart_mandate_id!);
        return NextResponse.json({ mandate: publicMandate(m) });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof PipelineError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return NextResponse.json({ error: "internal", detail: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const verify = req.nextUrl.searchParams.get("verify");
  if (verify) {
    const [intentId, cartId, paymentId] = verify.split(",").map((s) => s.trim());
    const report = await verifyChain(intentId, cartId, paymentId);
    return NextResponse.json(report, { status: report.ok ? 200 : 409 });
  }

  // Lookup helper: ?session_id=…&type=INTENT&latest=1
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const type = req.nextUrl.searchParams.get("type");
  const latest = req.nextUrl.searchParams.get("latest");
  if (sessionId && type && latest === "1") {
    // rowid breaks ties when two mandates share the same iat second.
    const res = await db().execute({
      sql: "SELECT id, hash, sig, signed_by, iat, exp FROM mandates WHERE session_id = ? AND type = ? ORDER BY iat DESC, rowid DESC LIMIT 1",
      args: [sessionId, type],
    });
    if (!res.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ mandate: res.rows[0] });
  }
  return NextResponse.json({ error: "?verify=intent,cart,payment or ?session_id=&type=&latest=1" }, { status: 400 });
}

function require(...vals: unknown[]): void {
  for (const v of vals) {
    if (v === undefined || v === null || v === "") {
      throw new PipelineError("missing required field");
    }
  }
}

// Full payload is already stored canonical; surface it verbatim plus metadata.
function publicMandate(m: {
  id: string; type: string; parent_hash: string | null; hash: string;
  signed_by: string; sig: string; alg: string; iat: number; exp: number;
  payload_json: string;
}) {
  return {
    id: m.id,
    type: m.type,
    parent_hash: m.parent_hash,
    hash: m.hash,
    signed_by: m.signed_by,
    sig: `${m.sig.slice(0, 16)}…`,
    alg: m.alg,
    iat: m.iat,
    exp: m.exp,
    payload: JSON.parse(m.payload_json),
  };
}
