import type { VaultRecord } from "../crypto/vaultCrypto";
import { api } from "./api";

export interface ServerVaultInfo {
  mode: "server";
  keyVersion: number;
  key: string; // base64, 32 bytes
  pending: VaultRecord | null; // a staged private vault, not yet activated
}

export interface PrivateVaultInfo {
  mode: "private";
  keyVersion: number;
  record: VaultRecord;
  revision: number;
}

export type VaultInfo = ServerVaultInfo | PrivateVaultInfo;

export interface VaultKeyResponse {
  keyVersion: number;
  key: string;
}

export async function fetchVault(): Promise<VaultInfo> {
  const { data } = await api.get<VaultInfo>("/vault/key");
  return data;
}

// Kept so older imports still compile. It only works for standard (server-key) vaults.
export async function fetchVaultKey(): Promise<VaultKeyResponse> {
  const info = await fetchVault();
  if (info.mode !== "server") throw new Error("This vault is private");
  return { keyVersion: info.keyVersion, key: info.key };
}

export async function stageVault(record: VaultRecord): Promise<void> {
  await api.post("/vault/private/stage", { record });
}

export async function cancelStagedVault(): Promise<void> {
  await api.post("/vault/private/cancel");
}

// The irreversible step: the server deletes its copy of the key.
export async function finalizeVault(keyVersion: number): Promise<{ revision: number }> {
  const { data } = await api.post<{ mode: "private"; revision: number }>("/vault/private/finalize", { keyVersion });
  return { revision: data.revision };
}

export async function updateVaultRecord(record: VaultRecord, baseRevision: number): Promise<number> {
  const { data } = await api.put<{ revision: number }>("/vault/private/record", { record, baseRevision });
  return data.revision;
}