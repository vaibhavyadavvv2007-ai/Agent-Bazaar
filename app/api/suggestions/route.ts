import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

/**
 * Merchant-side upsell feed. The bazaar (not the agent) decides what to
 * suggest; acceptance is measured, never coerced.
 *
 * POST { session_id, sku, cart_mandate_id? }  → presents a suggestion
 * GET  ?session_id=…                          → open suggestions for a session
 */
export async function POST(req: NextRequest) {
  let body: { session_id?: string; sku?: string; cart_mandate_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.session_id || !body.sku) {
    return NextResponse.json({ error: "session_id and sku required" }, { status: 400 });
  }

  const product = await db().execute({ sql: "SELECT id FROM products WHERE sku = ?", args: [body.sku] });
  if (!product.rows[0]) return NextResponse.json({ error: "unknown sku" }, { status: 404 });

  // Rule-based basis: complementary categories (chai ↔ mithai ↔ snacks).
  const suggestionId = randomUUID();
  await db().execute({
    sql: "INSERT INTO suggestions (id, session_id, product_id, cart_mandate_id, basis) VALUES (?, ?, ?, ?, ?)",
    args: [suggestionId, body.session_id, String(product.rows[0].id), body.cart_mandate_id ?? null, "complementary-category"],
  });
  await publish({
    type: "suggestion.presented",
    session_id: body.session_id,
    payload: { suggestion_id: suggestionId, sku: body.sku },
  });
  return NextResponse.json({ suggestion_id: suggestionId });
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "?session_id required" }, { status: 400 });
  const res = await db().execute({
    sql: `SELECT s.id, s.accepted, s.presented_at, p.sku, p.title, p.price_paise
          FROM suggestions s JOIN products p ON p.id = s.product_id
          WHERE s.session_id = ? ORDER BY s.presented_at`,
    args: [sessionId],
  });
  return NextResponse.json({ suggestions: res.rows });
}

/** PATCH { suggestion_id } — record acceptance (same write the agent tool makes). */
export async function PATCH(req: NextRequest) {
  let body: { suggestion_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.suggestion_id) return NextResponse.json({ error: "suggestion_id required" }, { status: 400 });

  const upd = await db().execute({
    sql: "UPDATE suggestions SET accepted = 1 WHERE id = ? AND accepted IS NULL",
    args: [body.suggestion_id],
  });
  if (Number(upd.rowsAffected) === 0) return NextResponse.json({ error: "not found or already decided" }, { status: 404 });

  const sid = await db().execute({ sql: "SELECT session_id FROM suggestions WHERE id = ?", args: [body.suggestion_id] });
  await publish({
    type: "suggestion.accepted",
    session_id: (sid.rows[0]?.session_id as string | undefined) ?? null,
    payload: { suggestion_id: body.suggestion_id },
  });
  return NextResponse.json({ accepted: true });
}
