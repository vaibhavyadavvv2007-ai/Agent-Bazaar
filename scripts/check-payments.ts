import { db } from "../lib/db";

async function main() {
  const res = await db().execute("SELECT * FROM payments ORDER BY created_at DESC LIMIT 5");
  console.log("Payments:", res.rows);
  const approvals = await db().execute("SELECT * FROM approvals ORDER BY requested_at DESC LIMIT 5");
  console.log("Approvals:", approvals.rows);
}
main().catch(console.error);
