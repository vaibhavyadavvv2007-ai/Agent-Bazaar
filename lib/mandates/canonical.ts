import { createHash } from "node:crypto";

/**
 * Canonical JSON — the substrate of the mandate chain.
 *
 * Signatures are only verifiable if serialization is deterministic, so every
 * mandate payload is serialized with recursively sorted object keys. Two
 * actors on opposite sides of the world produce byte-identical payloads.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // Array order is meaningful (cart line items); never reordered.
    return `[${value.map(serialize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value ${typeof value}`);
}

/** sha256 hex digest of the canonical form — a mandate's chain identity. */
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
