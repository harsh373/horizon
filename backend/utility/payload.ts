// Shared checks for encrypted payloads and client-generated record ids.
// The server never decrypts anything; it only makes sure what it stores has the right shape and size.

export interface StoredPayload {
  v: number;
  iv: string;
  ciphertext: string;
}

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Record ids are lowercase UUIDs made by the browser (crypto.randomUUID).
export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && RECORD_ID.test(value);
}

export function parsePayload(value: unknown, maxCiphertextLength: number): StoredPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const { v, iv, ciphertext } = input;

  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 99) return null;
  if (typeof iv !== "string" || iv.length === 0 || iv.length > 64 || !BASE64.test(iv)) return null;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > maxCiphertextLength) return null;
  if (!BASE64.test(ciphertext)) return null;

  return { v, iv, ciphertext };
}

export function plainPayload(payload: StoredPayload): StoredPayload {
  return { v: payload.v, iv: payload.iv, ciphertext: payload.ciphertext };
}