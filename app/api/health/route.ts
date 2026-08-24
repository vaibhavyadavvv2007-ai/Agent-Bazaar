import { NextResponse } from "next/server";
import { db, rowsToObjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await db().execute("SELECT COUNT(*) AS c FROM products");
    const products = Number(rowsToObjects<{ c: number }>(res)[0]?.c ?? 0);
    return NextResponse.json({ ok: true, store: "agent-bazaar", products, mode: "test-only" });
  } catch {
    return NextResponse.json(
      { ok: false, reason: "db not migrated — run `npm run setup`" },
      { status: 503 }
    );
  }
}
