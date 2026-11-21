import { fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from "./bytes";
import { VaultError } from "./errors";
import { decodeRecoveryCode, encodeRecoveryCode, RECOVERY_BYTES } from "./recoveryCode";

export const KDF_ITERATIONS = 600_000;
export const FORMAT_VERSION = 1;
const MAX_ITERATIONS = 10_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSPHRASE_LENGTH = 12;

export interface WrappedKey {
  iv: string; // base64
  data: string; // base64
}

// This is the only vault data a private vault would store on the server. Without the
// passphrase or the recovery code, it is just random-looking bytes.
export interface VaultRecord {
  version: number;
  kdf: { salt: string; iterations: number };
  recoverySalt: string;
  passphraseWrap: WrappedKey;
  recoveryWrap: WrappedKey;
}

// `iterations` is the cost used when creating or rewrapping AND the minimum we accept when
// unlocking, so a hostile server can't quietly hand back a record with a weak setting.
export interface CryptoOptions {
  iterations?: number;
}

export interface RecordContext {
  userId: string;
  kind: string; // e.g. "journal", "thought"
  recordId: string;
}

export interface EncryptedPayload {
  v: number;
  iv: string;
  ciphertext: string;
}

type Purpose = "passphrase" | "recovery";

function floorFor(options: CryptoOptions): number {
  return options.iterations ?? KDF_ITERATIONS;
}

function normalizePassphrase(passphrase: string): string {
  // NFKC makes the same typed phrase produce the same bytes on every keyboard and OS.
  return passphrase.normalize("NFKC");
}

function assertPassphrase(passphrase: string): string {
  const normalized = normalizePassphrase(passphrase);
  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new VaultError("WEAK_PASSPHRASE", `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  return normalized;
}

function assertRecord(record: VaultRecord, options: CryptoOptions): void {
  if (record.version !== FORMAT_VERSION) {
    throw new VaultError("UNSUPPORTED_VERSION", "This vault was made by a newer version of the app.");
  }
  const { iterations } = record.kdf;
  if (!Number.isInteger(iterations) || iterations < floorFor(options) || iterations > MAX_ITERATIONS) {
    throw new VaultError("WEAK_KDF", "Vault key settings look wrong, so unlocking was refused.");
  }
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// The recovery code is already 160 random bits, so a fast key-stretch (HKDF) is enough.
async function deriveRecoveryKey(codeBytes: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", codeBytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8("horizon:recovery-kek:v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

function wrapAad(purpose: Purpose): Uint8Array<ArrayBuffer> {
  return utf8(`horizon:v1:wrap:${purpose}`);
}

async function wrapMaster(master: CryptoKey, kek: CryptoKey, purpose: Purpose): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES);
  const data = await crypto.subtle.wrapKey("raw", master, kek, {
    name: "AES-GCM",
    iv,
    additionalData: wrapAad(purpose),
  });
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

async function unwrapMaster(wrapped: WrappedKey, kek: CryptoKey, purpose: Purpose, extractable: boolean): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      fromBase64(wrapped.data),
      kek,
      { name: "AES-GCM", iv: fromBase64(wrapped.iv), additionalData: wrapAad(purpose) },
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new VaultError("WRONG_SECRET", "Wrong passphrase or recovery code.");
  }
}

async function unlockExtractable(record: VaultRecord, passphrase: string, options: CryptoOptions): Promise<CryptoKey> {
  assertRecord(record, options);
  const kek = await derivePassphraseKey(normalizePassphrase(passphrase), fromBase64(record.kdf.salt), record.kdf.iterations);
  return unwrapMaster(record.passphraseWrap, kek, "passphrase", true);
}

async function recoveryExtractable(record: VaultRecord, code: string, options: CryptoOptions): Promise<CryptoKey> {
  assertRecord(record, options);
  const kek = await deriveRecoveryKey(decodeRecoveryCode(code), fromBase64(record.recoverySalt));
  return unwrapMaster(record.recoveryWrap, kek, "recovery", true);
}

// Wraps `master` under a fresh passphrase key and returns the updated record plus a
// usable, non-extractable copy of the master key.
async function withNewPassphrase(
  record: VaultRecord,
  master: CryptoKey,
  newPassphrase: string,
  options: CryptoOptions,
): Promise<{ record: VaultRecord; masterKey: CryptoKey }> {
  const normalized = assertPassphrase(newPassphrase);
  const iterations = floorFor(options);
  const salt = randomBytes(SALT_BYTES);
  const kek = await derivePassphraseKey(normalized, salt, iterations);
  const passphraseWrap = await wrapMaster(master, kek, "passphrase");
  const next: VaultRecord = { ...record, kdf: { salt: toBase64(salt), iterations }, passphraseWrap };
  const masterKey = await unwrapMaster(passphraseWrap, kek, "passphrase", false);
  return { record: next, masterKey };
}

// ---------- Vault lifecycle ----------

export async function createVault(
  passphrase: string,
  options: CryptoOptions = {},
): Promise<{ masterKey: CryptoKey; recoveryCode: string; record: VaultRecord }> {
  const normalized = assertPassphrase(passphrase);
  const iterations = floorFor(options);

  // Extractable only for these few lines, so it can be wrapped. The key handed back is not.
  const master = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  const salt = randomBytes(SALT_BYTES);
  const recoverySalt = randomBytes(SALT_BYTES);
  const codeBytes = randomBytes(RECOVERY_BYTES);

  const [passphraseKek, recoveryKek] = await Promise.all([
    derivePassphraseKey(normalized, salt, iterations),
    deriveRecoveryKey(codeBytes, recoverySalt),
  ]);

  const passphraseWrap = await wrapMaster(master, passphraseKek, "passphrase");
  const recoveryWrap = await wrapMaster(master, recoveryKek, "recovery");

  const record: VaultRecord = {
    version: FORMAT_VERSION,
    kdf: { salt: toBase64(salt), iterations },
    recoverySalt: toBase64(recoverySalt),
    passphraseWrap,
    recoveryWrap,
  };

  const masterKey = await unwrapMaster(passphraseWrap, passphraseKek, "passphrase", false);
  return { masterKey, recoveryCode: encodeRecoveryCode(codeBytes), record };
}

export async function unlockWithPassphrase(record: VaultRecord, passphrase: string, options: CryptoOptions = {}): Promise<CryptoKey> {
  assertRecord(record, options);
  const kek = await derivePassphraseKey(normalizePassphrase(passphrase), fromBase64(record.kdf.salt), record.kdf.iterations);
  return unwrapMaster(record.passphraseWrap, kek, "passphrase", false);
}

export async function unlockWithRecoveryCode(record: VaultRecord, code: string, options: CryptoOptions = {}): Promise<CryptoKey> {
  assertRecord(record, options);
  const kek = await deriveRecoveryKey(decodeRecoveryCode(code), fromBase64(record.recoverySalt));
  return unwrapMaster(record.recoveryWrap, kek, "recovery", false);
}

export async function changePassphrase(
  record: VaultRecord,
  currentPassphrase: string,
  newPassphrase: string,
  options: CryptoOptions = {},
): Promise<{ record: VaultRecord; masterKey: CryptoKey }> {
  const master = await unlockExtractable(record, currentPassphrase, options);
  return withNewPassphrase(record, master, newPassphrase, options);
}

// The "I forgot my passphrase" path.
export async function resetPassphraseWithRecoveryCode(
  record: VaultRecord,
  recoveryCode: string,
  newPassphrase: string,
  options: CryptoOptions = {},
): Promise<{ record: VaultRecord; masterKey: CryptoKey }> {
  const master = await recoveryExtractable(record, recoveryCode, options);
  return withNewPassphrase(record, master, newPassphrase, options);
}

export async function regenerateRecoveryCode(
  record: VaultRecord,
  passphrase: string,
  options: CryptoOptions = {},
): Promise<{ record: VaultRecord; recoveryCode: string }> {
  const master = await unlockExtractable(record, passphrase, options);
  const recoverySalt = randomBytes(SALT_BYTES);
  const codeBytes = randomBytes(RECOVERY_BYTES);
  const kek = await deriveRecoveryKey(codeBytes, recoverySalt);
  const recoveryWrap = await wrapMaster(master, kek, "recovery");
  return {
    record: { ...record, recoverySalt: toBase64(recoverySalt), recoveryWrap },
    recoveryCode: encodeRecoveryCode(codeBytes),
  };
}

// ---------- Encrypting records ----------

// The context is bound into every ciphertext, so the server can't move an entry to another
// user, another record type or another record id without decryption failing.
function recordAad(context: RecordContext): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify(["horizon", "v1", context.userId, context.kind, context.recordId]));
}

export async function encryptText(key: CryptoKey, plaintext: string, context: RecordContext): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES); // fresh and random for every single encryption
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: recordAad(context) },
    key,
    utf8(plaintext),
  );
  return { v: FORMAT_VERSION, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload, context: RecordContext): Promise<string> {
  if (payload.v !== FORMAT_VERSION) {
    throw new VaultError("UNSUPPORTED_VERSION", "This entry was made by a newer version of the app.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv), additionalData: recordAad(context) },
      key,
      fromBase64(payload.ciphertext),
    );
    return fromUtf8(plaintext);
  } catch {
    throw new VaultError("DECRYPT_FAILED", "Could not decrypt this entry.");
  }
}

export async function encryptJson(key: CryptoKey, value: unknown, context: RecordContext): Promise<EncryptedPayload> {
  return encryptText(key, JSON.stringify(value), context);
}

export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload, context: RecordContext): Promise<T> {
  return JSON.parse(await decryptText(key, payload, context)) as T;
}