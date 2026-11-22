import { fromBase64, randomBytes, toBase64, utf8 } from "./bytes";
import { VaultError } from "./errors";
import { encodeRecoveryCode, RECOVERY_BYTES } from "./recoveryCode";
import { FORMAT_VERSION, KDF_ITERATIONS } from "./vaultCrypto";
import type { CryptoOptions, VaultRecord, WrappedKey } from "./vaultCrypto";

// Turns an EXISTING data key into a private vault record. createVault() in vaultCrypto.ts
// makes a brand-new key, which would orphan data that is already encrypted.
// The wrapping format is identical to vaultCrypto.ts, so unlockWithPassphrase and
// unlockWithRecoveryCode open what this makes.

const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSPHRASE_LENGTH = 12;

type Purpose = "passphrase" | "recovery";

// Extractable only because it has to be wrapped. It is used inside the enable flow and then dropped.
export async function importExtractableKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error("Unexpected key length");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

async function passphraseKek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function recoveryKek(codeBytes: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", codeBytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8("horizon:recovery-kek:v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrap(master: CryptoKey, kek: CryptoKey, purpose: Purpose): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES);
  const data = await crypto.subtle.wrapKey("raw", master, kek, {
    name: "AES-GCM",
    iv,
    additionalData: utf8(`horizon:v1:wrap:${purpose}`),
  });
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function createVaultFromKey(
  master: CryptoKey,
  passphrase: string,
  options: CryptoOptions = {},
): Promise<{ recoveryCode: string; record: VaultRecord }> {
  if (!master.extractable) throw new Error("The key must be exportable to be wrapped");

  const normalized = passphrase.normalize("NFKC");
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new VaultError("WEAK_PASSPHRASE", `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const iterations = options.iterations ?? KDF_ITERATIONS;

  const salt = randomBytes(SALT_BYTES);
  const recoverySalt = randomBytes(SALT_BYTES);
  const codeBytes = randomBytes(RECOVERY_BYTES);

  const [passKek, recKek] = await Promise.all([
    passphraseKek(normalized, salt, iterations),
    recoveryKek(codeBytes, recoverySalt),
  ]);

  const passphraseWrap = await wrap(master, passKek, "passphrase");
  const recoveryWrap = await wrap(master, recKek, "recovery");

  return {
    recoveryCode: encodeRecoveryCode(codeBytes),
    record: {
      version: FORMAT_VERSION,
      kdf: { salt: toBase64(salt), iterations },
      recoverySalt: toBase64(recoverySalt),
      passphraseWrap,
      recoveryWrap,
    },
  };
}

// True only if both keys encrypt and decrypt the same data, i.e. they are the same key.
export async function sameKey(a: CryptoKey, b: CryptoKey): Promise<boolean> {
  try {
    const iv = randomBytes(IV_BYTES);
    const probe = randomBytes(32);
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, a, probe);
    const opened = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, b, sealed));
    return opened.length === probe.length && opened.every((value, index) => value === probe[index]);
  } catch {
    return false;
  }
}