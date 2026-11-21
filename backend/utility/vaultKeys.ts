import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env";

const IV_BYTES = 12;
const TAG_BYTES = 16;

// The wrapping key is derived from VAULT_SECRET and never stored anywhere.
const WRAP_KEY = Buffer.from(
  hkdfSync(
    "sha256",
    Buffer.from(env.vaultSecret, "base64"),
    Buffer.from("horizon:vault-salt:v1", "utf8"),
    Buffer.from("horizon:vault-wrap:v1", "utf8"),
    32,
  ),
);

export interface WrappedDataKey {
  iv: string; // base64
  data: string; // base64 (ciphertext + auth tag)
}

function aad(userId: string, keyVersion: number): Buffer {
  return Buffer.from(JSON.stringify(["horizon", "vault", userId, keyVersion]), "utf8");
}

export function generateDataKey(): Buffer {
  return randomBytes(32);
}

export function wrapDataKey(dataKey: Buffer, userId: string, keyVersion: number): WrappedDataKey {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", WRAP_KEY, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(userId, keyVersion));
  const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("base64"), data: Buffer.concat([encrypted, tag]).toString("base64") };
}

export function unwrapDataKey(wrapped: WrappedDataKey, userId: string, keyVersion: number): Buffer {
  const raw = Buffer.from(wrapped.data, "base64");
  if (raw.length <= TAG_BYTES) throw new Error("Stored vault key is malformed");
  const decipher = createDecipheriv("aes-256-gcm", WRAP_KEY, Buffer.from(wrapped.iv, "base64"), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aad(userId, keyVersion));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(0, raw.length - TAG_BYTES)), decipher.final()]);
}