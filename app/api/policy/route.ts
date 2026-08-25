import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, rowsToObjects } from "@/lib/db";
import { publish } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

/**
 * The street walls — merchant-facing policy management.
 *
 * GET  → the live rule set (what every agent is bounded by, right now)
 * PUT  → change one rule; validated, clamped, and announced on the event
 *        stream so every watcher (floor, dashboard) sees the walls move.
 *
 * The shopkeeper gameplay renders THESE — sliders move real enforcement,
 * never a cosmetic copy.
 */

type RuleRow = {
  id: string;
  agent_id: string | null;
  kind: "daily_cap" | "velocity" | "category_deny" | "max_single";
  config_json: string;
  enabled: number;
};

export async function GET() {
  const rules = rowsToObjects<RuleRow>(
    await db().execute("SELECT id, agent_id, kind, config_json, enabled FROM policy_rules ORDER BY kind, id")
  );
  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      kind: r.kind,
      enabled: r.enabled === 1,
      config: JSON.parse(r.config_json) as Record<string, unknown>,
    })),
  });
}

const putSchema = z.object({
  rule_id: z.string().min(1),
  enabled: z.boolean().optional(),
  // INR values from the UI; converted to paise server-side where applicable.
  limit_inr: z.number().positive().optional(),
  max_txns: z.number().int().positive().optional(),
  window_minutes: z.number().int().positive().optional(),
  category: z.string().min(1).optional(),
});

// Clamp rails — the shopkeeper plays, but inside sane bounds.
const CLAMPS = {
  daily_cap: { min: 100, max: 50_000 }, // INR
  max_single: { min: 100, max: 10_000 }, // INR
  velocity: { minTxns: 1, maxTxns: 30, minWindow: 5, maxWindow: 240 },
};

export async function PUT(req: NextRequest) {
  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body", detail: String(e) }, { status: 400 });
  }

  const res = await db().execute({ sql: "SELECT id, kind, config_json, enabled FROM policy_rules WHERE id = ?", args: [body.rule_id] });
  const row = res.rows[0];
  if (!row) return NextResponse.json({ error: "unknown rule" }, { status: 404 });

  const kind = String(row.kind) as RuleRow["kind"];
  const config = JSON.parse(String(row.config_json)) as Record<string, unknown>;
  let changed: Record<string, unknown> = {};

  switch (kind) {
    case "daily_cap":
    case "max_single": {
      if (body.limit_inr !== undefined) {
        const inr = Math.min(CLAMPS[kind].max, Math.max(CLAMPS[kind].min, Math.round(body.limit_inr)));
        config.limit_paise = inr * 100;
        changed = { limit_inr: inr };
      }
      break;
    }
    case "velocity": {
      if (body.max_txns !== undefined) {
        config.max_txns = Math.min(CLAMPS.velocity.maxTxns, Math.max(CLAMPS.velocity.minTxns, body.max_txns));
        changed.max_txns = config.max_txns;
      }
      if (body.window_minutes !== undefined) {
        config.window_minutes = Math.min(CLAMPS.velocity.maxWindow, Math.max(CLAMPS.velocity.minWindow, body.window_minutes));
        changed.window_minutes = config.window_minutes;
      }
      break;
    }
    case "category_deny": {
      if (body.category !== undefined) {
        config.category = body.category.slice(0, 24).toLowerCase();
        changed.category = config.category;
      }
      break;
    }
  }

  const enabled = body.enabled === undefined ? undefined : body.enabled ? 1 : 0;

  await db().execute({
    sql: `UPDATE policy_rules SET config_json = ?, enabled = COALESCE(?, enabled) WHERE id = ?`,
    args: [JSON.stringify(config), enabled ?? null, body.rule_id],
  });

  await publish({
    type: "policy.updated",
    payload: { rule_id: body.rule_id, kind, config, enabled: enabled === null ? undefined : enabled === 1, changed },
  });

  return NextResponse.json({ ok: true, rule_id: body.rule_id, kind, config, enabled: enabled === null ? undefined : enabled === 1 });
}
