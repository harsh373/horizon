import type { Request, Response } from "express";
import { currentUserId } from "../config/userScope";
import { Vault } from "../models/Vault";
import type { VaultFields } from "../models/Vault";
import { parsePrivateRecord } from "../utility/privateVaultRecord";
import { generateDataKey, unwrapDataKey, wrapDataKey } from "../utility/vaultKeys";

type StoredVault = Pick<
  VaultFields,
  "mode" | "keyVersion" | "wrappedKey" | "pendingPrivate" | "privateRecord" | "privateRevision"
>;

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

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

  // Keys and key blobs must never be cached by the browser or any proxy.
  res.set("Cache-Control", "no-store");

  if (vault.mode === "private") {
    if (!vault.privateRecord) throw new Error("Private vault record is missing");
    // No key here, by design. The browser has to unlock it with the password or recovery key.
    res.status(200).json({
      mode: "private",
      keyVersion: vault.keyVersion,
      record: vault.privateRecord,
      revision: vault.privateRevision ?? 0,
    });
    return;
  }

  if (!vault.wrappedKey) throw new Error("Stored vault key is missing");
  const dataKey = unwrapDataKey(vault.wrappedKey, userId, vault.keyVersion);
  res.status(200).json({
    mode: "server",
    keyVersion: vault.keyVersion,
    key: dataKey.toString("base64"),
    pending: vault.pendingPrivate ?? null,
  });
}

// Step 1: store the locked blobs next to the server key. Deletes nothing, fully reversible.
export async function stagePrivateVault(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const record = parsePrivateRecord(req.body?.record);
  if (!record) {
    fail(res, 400, "That vault record is not valid.");
    return;
  }

  await loadOrCreateVault(currentUserId());
  const updated = await Vault.findOneAndUpdate({ mode: "server" }, { $set: { pendingPrivate: record } }, { new: true }).lean();
  if (!updated) {
    fail(res, 409, "This account already has a private vault.");
    return;
  }
  res.status(200).json({ ok: true });
}

// Removes a staged record, e.g. when the browser's test unlock failed. Safe to call any time.
export async function cancelPrivateVault(_req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  await Vault.findOneAndUpdate({ mode: "server" }, { $unset: { pendingPrivate: 1 } });
  res.status(200).json({ ok: true });
}

// The irreversible step: deletes the server's copy of the key. Only works on a staged record.
export async function finalizePrivateVault(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const keyVersion: unknown = req.body?.keyVersion;
  if (typeof keyVersion !== "number" || !Number.isInteger(keyVersion)) {
    fail(res, 400, "keyVersion is required.");
    return;
  }

  const vault = await Vault.findOne().lean();
  if (!vault) {
    fail(res, 409, "No vault found.");
    return;
  }
  // A retry after a dropped response should not look like a failure.
  if (vault.mode === "private") {
    res.status(200).json({ mode: "private", revision: vault.privateRevision ?? 0 });
    return;
  }

  const staged = parsePrivateRecord(vault.pendingPrivate);
  if (vault.keyVersion !== keyVersion || !staged) {
    fail(res, 409, "Nothing is staged for this vault.");
    return;
  }

  // The filter pins the exact staged record we just read, so a re-stage in between is refused.
  const updated = await Vault.findOneAndUpdate(
    {
      mode: "server",
      keyVersion,
      "pendingPrivate.passphraseWrap.iv": staged.passphraseWrap.iv,
      "pendingPrivate.recoveryWrap.iv": staged.recoveryWrap.iv,
    },
    {
      $set: { mode: "private", privateRecord: staged, privateRevision: 1 },
      $unset: { wrappedKey: 1, pendingPrivate: 1 },
    },
    { new: true },
  ).lean();

  if (!updated) {
    fail(res, 409, "The vault changed while finishing. Please try again.");
    return;
  }
  res.status(200).json({ mode: "private", revision: 1 });
}

// Change password or make a new recovery key. baseRevision stops two tabs overwriting each other.
export async function updatePrivateRecord(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const record = parsePrivateRecord(req.body?.record);
  const baseRevision: unknown = req.body?.baseRevision;
  if (!record || typeof baseRevision !== "number" || !Number.isInteger(baseRevision)) {
    fail(res, 400, "That vault update is not valid.");
    return;
  }

  const updated = await Vault.findOneAndUpdate(
    { mode: "private", privateRevision: baseRevision },
    { $set: { privateRecord: record }, $inc: { privateRevision: 1 } },
    { new: true },
  ).lean();

  if (!updated) {
    fail(res, 409, "Your vault changed somewhere else. Reload and try again.");
    return;
  }
  res.status(200).json({ revision: updated.privateRevision ?? 0 });
}