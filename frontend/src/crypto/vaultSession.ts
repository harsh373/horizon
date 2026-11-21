import { decryptJson, encryptJson } from "./vaultCrypto";
import type { EncryptedPayload } from "./vaultCrypto";

// Holds the unlocked data key for the signed-in user, in memory only.
// VaultProvider sets it after sign-in and clears it on sign-out. API files call encryptRecord and
// decryptRecord directly, the same way api.ts gets its token through setTokenGetter.
let session: { key: CryptoKey; userId: string } | null = null;
const cleanups = new Set<() => void>();

// API files register their in-memory caches here, so nothing from one account can survive into the next.
export function onVaultCleared(fn: () => void): void {
  cleanups.add(fn);
}

export function setVaultSession(key: CryptoKey, userId: string): void {
  session = { key, userId };
}

export function clearVaultSession(): void {
  session = null;
  cleanups.forEach((fn) => fn());
}

export async function encryptRecord(kind: string, recordId: string, value: unknown): Promise<EncryptedPayload> {
  if (!session) throw new Error("Vault is not ready");
  return encryptJson(session.key, value, { userId: session.userId, kind, recordId });
}

export async function decryptRecord<T>(kind: string, recordId: string, payload: EncryptedPayload): Promise<T> {
  if (!session) throw new Error("Vault is not ready");
  return decryptJson<T>(session.key, payload, { userId: session.userId, kind, recordId });
}