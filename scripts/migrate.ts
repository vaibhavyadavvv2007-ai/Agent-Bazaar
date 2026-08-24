import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db } from "../lib/db";

// Local file DBs need the directory to exist first; Turso ignores this.
mkdirSync("./data", { recursive: true });

const sql = readFileSync(fileURLToPath(new URL("../schema.sql", import.meta.url)), "utf8");
await db().executeMultiple(sql);
console.log("migration complete");
