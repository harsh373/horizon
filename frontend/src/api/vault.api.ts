import { api } from "./api";

export interface VaultKeyResponse {
  keyVersion: number;
  key: string; // base64, 32 bytes
}

export async function fetchVaultKey(): Promise<VaultKeyResponse> {
  const { data } = await api.get<VaultKeyResponse>("/vault/key");
  return data;
}