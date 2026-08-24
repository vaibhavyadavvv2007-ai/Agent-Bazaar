import { createClient, type Client, type Row } from "@libsql/client";

/**
 * Single shared DB client.
 * - Local dev with no env: file-backed SQLite at ./data/bazaar.db
 * - Production / shared demo: Turso via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 * Same SQL either way — that's the point.
 */
let _client: Client | null = null;

export function db(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL || "file:./data/bazaar.db";
    _client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
  }
  return _client;
}

export function rowsToObjects<T>(result: { rows: Row[] }): T[] {
  return result.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(r)) o[k] = r[k];
    return o as T;
  });
}
