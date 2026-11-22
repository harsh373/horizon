import { Schema, model } from "mongoose";

export interface WrappedKeyFields {
  iv: string;
  data: string;
}

// What a private vault stores: random-looking bytes that need the password or recovery key to open.
export interface PrivateVaultRecord {
  version: number;
  kdf: { salt: string; iterations: number };
  recoverySalt: string;
  passphraseWrap: WrappedKeyFields;
  recoveryWrap: WrappedKeyFields;
}

export interface VaultFields {
  // "server": the server holds a wrapped copy of the key (standard mode).
  // "private": the server copy is gone; only privateRecord exists.
  mode: "server" | "private";
  keyVersion: number;
  wrappedKey?: WrappedKeyFields;
  // Uploaded but not yet activated. The server key is still intact while this is set.
  pendingPrivate?: PrivateVaultRecord;
  privateRecord?: PrivateVaultRecord;
  privateRevision?: number;
  createdAt: Date;
  updatedAt: Date;
}

const wrappedKeySchema = new Schema(
  {
    iv: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false },
);

const privateRecordSchema = new Schema(
  {
    version: { type: Number, required: true },
    kdf: {
      salt: { type: String, required: true },
      iterations: { type: Number, required: true },
    },
    recoverySalt: { type: String, required: true },
    passphraseWrap: { type: wrappedKeySchema, required: true },
    recoveryWrap: { type: wrappedKeySchema, required: true },
  },
  { _id: false },
);

const vaultSchema = new Schema<VaultFields>(
  {
    mode: { type: String, enum: ["server", "private"], default: "server" },
    keyVersion: { type: Number, required: true, default: 1 },
    // Not "required": it is deliberately removed when the vault becomes private.
    wrappedKey: { type: wrappedKeySchema },
    pendingPrivate: { type: privateRecordSchema },
    privateRecord: { type: privateRecordSchema },
    privateRevision: { type: Number },
  },
  { timestamps: true },
);

// One vault per user per key version. It stops two parallel first requests creating two keys.
vaultSchema.index({ userId: 1, keyVersion: 1 }, { unique: true });

export const Vault = model<VaultFields>("Vault", vaultSchema);