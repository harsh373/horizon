import type { PrivateVaultRecord, WrappedKeyFields } from "../models/Vault";

const FORMAT_VERSION = 1;
const MIN_ITERATIONS = 600_000;
const MAX_ITERATIONS = 10_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True only for canonical base64 that decodes to exactly `bytes` bytes.
function isBase64Of(value: unknown, bytes: number): value is string {
  if (typeof value !== "string" || !BASE64.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === bytes && decoded.toString("base64") === value;
}

function parseWrap(value: unknown): WrappedKeyFields | null {
  if (!isObject(value)) return null;
  const iv = value["iv"];
  const data = value["data"];
  // 12-byte IV; 32-byte key plus 16-byte GCM tag = 48 bytes.
  if (!isBase64Of(iv, 12) || !isBase64Of(data, 48)) return null;
  return { iv, data };
}

// Returns a clean copy with only the known fields, or null if anything looks wrong.
export function parsePrivateRecord(value: unknown): PrivateVaultRecord | null {
  if (!isObject(value)) return null;
  if (value["version"] !== FORMAT_VERSION) return null;

  const kdf = value["kdf"];
  if (!isObject(kdf)) return null;
  const iterations = kdf["iterations"];
  const salt = kdf["salt"];
  const recoverySalt = value["recoverySalt"];

  if (typeof iterations !== "number" || !Number.isInteger(iterations)) return null;
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
  if (!isBase64Of(salt, 16) || !isBase64Of(recoverySalt, 16)) return null;

  const passphraseWrap = parseWrap(value["passphraseWrap"]);
  const recoveryWrap = parseWrap(value["recoveryWrap"]);
  if (!passphraseWrap || !recoveryWrap) return null;

  return {
    version: FORMAT_VERSION,
    kdf: { salt, iterations },
    recoverySalt,
    passphraseWrap,
    recoveryWrap,
  };
}