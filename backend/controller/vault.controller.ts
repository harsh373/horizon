import type { Request, Response } from "express";
import { currentUserId } from "../config/userScope";
import { Vault } from "../models/Vault";
import type { VaultFields } from "../models/Vault";
import { generateDataKey, unwrapDataKey, wrapDataKey } from "../utility/vaultKeys";

type StoredVault = Pick<VaultFields, "keyVersion" | "wrappedKey">;

async function loadOrCreateVault(userId: string): Promise<StoredVault> {
  const existing = await Vault.findOne().lean();
  if (existing) return existing;

  const keyVersion = 1;
  const wrappedKey = wrapDataKey(generateDataKey(), userId, keyVersion);

  try {
    // $setOnInsert only applies if no document exists yet, so a request that loses a race
    // simply gets back the winner's key and its own freshly made key is discarded.
    const created = await Vault.findOneAndUpdate(
      {},
      { $setOnInsert: { mode: "server", keyVersion, wrappedKey } },
      { upsert: true, new: true },
    ).lean();
    if (created) return created;
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
    if (!duplicate) throw error;
  }

  const winner = await Vault.findOne().lean();
  if (!winner) throw new Error("Could not create vault key");
  return winner;
}

export async function getVaultKey(_req: Request, res: Response): Promise<void> {
  const userId = currentUserId();
  const vault = await loadOrCreateVault(userId);
  const dataKey = unwrapDataKey(vault.wrappedKey, userId, vault.keyVersion);

  // Keys must never be cached by the browser or any proxy.
  res.set("Cache-Control", "no-store");
  res.status(200).json({ keyVersion: vault.keyVersion, key: dataKey.toString("base64") });
}