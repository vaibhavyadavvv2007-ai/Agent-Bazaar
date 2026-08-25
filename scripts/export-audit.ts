import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../lib/db";

/**
 * Export the immutable audit trail as JSONL — the artifact an auditor (or a
 * judge) can replay line by line. Every event ever published, in order.
 *
 *   npx tsx scripts/export-audit.ts [--out ./audit.jsonl] [--session <id>]
 */
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const out = flag("out") ?? "./audit.jsonl";
const session = flag("session");

const res = session
  ? await db().execute({ sql: "SELECT id, ts, session_id, type, payload_json FROM events WHERE session_id = ? ORDER BY ts, rowid", args: [session] })
  : await db().execute("SELECT id, ts, session_id, type, payload_json FROM events ORDER BY ts, rowid");

mkdirSync(".", { recursive: true });
const lines = res.rows
  .map((r) => JSON.stringify({ id: r.id, ts: r.ts, session_id: r.session_id, type: r.type, payload: JSON.parse(String(r.payload_json || "{}")) }))
  .join("\n");

writeFileSync(out, lines ? lines + "\n" : "");
console.log(`exported ${res.rows.length} events → ${out}`);
