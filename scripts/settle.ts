import { settleLink, type SettleOutcome } from "./settle-core";

/**
 * CLI: npx tsx scripts/settle.ts --url <checkout_url> --outcome success|failure [--headed]
 * Used during the D2 spike and for one-off settlements.
 */
const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const url = flag("url");
const outcome = (flag("outcome") ?? "success") as SettleOutcome;

if (!url) {
  console.error("usage: tsx scripts/settle.ts --url <checkout_url> --outcome success|failure [--headed]");
  process.exit(1);
}

const result = await settleLink(url, outcome, { headless: flag("headed") !== "true" });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok === (outcome === "success") ? 0 : 2);
