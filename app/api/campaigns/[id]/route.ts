import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/campaigns/[id] — toggle enabled, edit fields
 *
 * Body: { enabled?: boolean, name?, description?, config?, starts_at?, ends_at? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Verify campaign exists
  const existing = await db().execute({
    sql: "SELECT id FROM campaigns WHERE id = ?",
    args: [id],
  });
  if (!existing.rows[0]) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const updates: string[] = [];
  const args: (string | number | null)[] = [];

  if (typeof body.enabled === "boolean") {
    updates.push("enabled = ?");
    args.push(body.enabled ? 1 : 0);
  }
  if (typeof body.name === "string") {
    updates.push("name = ?");
    args.push(body.name);
  }
  if (typeof body.description === "string") {
    updates.push("description = ?");
    args.push(body.description);
  }
  if (body.config && typeof body.config === "object") {
    updates.push("config_json = ?");
    args.push(JSON.stringify(body.config));
  }
  if (typeof body.starts_at === "string") {
    updates.push("starts_at = ?");
    args.push(body.starts_at);
  }
  if (typeof body.ends_at === "string") {
    updates.push("ends_at = ?");
    args.push(body.ends_at);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  args.push(id);
  await db().execute({
    sql: `UPDATE campaigns SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ id, status: "updated" });
}

/**
 * DELETE /api/campaigns/[id] — remove a campaign
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await db().execute({
    sql: "SELECT id FROM campaigns WHERE id = ?",
    args: [id],
  });
  if (!existing.rows[0]) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  await db().execute({
    sql: "DELETE FROM campaigns WHERE id = ?",
    args: [id],
  });

  return NextResponse.json({ id, status: "deleted" });
}
