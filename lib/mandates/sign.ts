import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Mandate signatures.
 *
 * Three actors sign three different links of the chain:
 *   user     signs the INTENT   ("here is what I authorize, and its bounds")
 *   agent    signs the CART     ("this is exactly what I propose to buy")
 *   merchant signs the PAYMENT  ("at this price, I will fulfill it")
 *
 * Keys are Ed25519 via Node's built-in crypto (no third-party dep), generated
 * on first use and persisted so old mandates stay verifiable across restarts.
 * The user key living server-side is a declared demo limitation — on a real
 * device it would live in the trusted execution surface and never leave it.
 */
export type Actor = "user" | "agent" | "merchant";

type KeyRow = { actor: string; public_key: string; private_key: string };

async function ensureKeyPair(actor: Actor): Promise<KeyRow> {
  const existing = await db().execute({
    sql: "SELECT actor, public_key, private_key FROM actor_keys WHERE actor = ?",
    args: [actor],
  });
  const row = existing.rows[0];
  if (row) return row as unknown as KeyRow;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  await db().execute({
    sql: `INSERT INTO actor_keys (actor, public_key, private_key) VALUES (?, ?, ?)
          ON CONFLICT(actor) DO NOTHING`,
    args: [actor, publicPem, privatePem],
  });

  // Another instance may have won the race; re-read for a single source of truth.
  const after = await db().execute({
    sql: "SELECT actor, public_key, private_key FROM actor_keys WHERE actor = ?",
    args: [actor],
  });
  if (!after.rows[0]) throw new Error(`could not persist keypair for ${actor}`);
  return after.rows[0] as unknown as KeyRow;
}

/** Sign canonical payload text as `actor`. Returns base64 signature. */
export async function signMandate(actor: Actor, canonicalPayload: string): Promise<string> {
  const key = await ensureKeyPair(actor);
  // Ed25519 signs raw messages: algorithm must be null.
  return Buffer.from(cryptoSign(null, Buffer.from(canonicalPayload, "utf8"), key.private_key)).toString("base64");
}

/** Verify a mandate signature. Never throws on mismatch — returns false. */
export async function verifyMandate(
  actor: Actor,
  canonicalPayload: string,
  sigBase64: string
): Promise<boolean> {
  try {
    const key = await ensureKeyPair(actor);
    return cryptoVerify(
      null,
      Buffer.from(canonicalPayload, "utf8"),
      key.public_key,
      Buffer.from(sigBase64, "base64")
    );
  } catch {
    return false;
  }
}
