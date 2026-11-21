import { Schema, model } from "mongoose";

export interface VaultFields {
  // "server" today. A future private vault would flip this once the user's passphrase holds the key.
  mode: "server";
  keyVersion: number;
  wrappedKey: { iv: string; data: string };
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

const vaultSchema = new Schema<VaultFields>(
  {
    mode: { type: String, enum: ["server"], default: "server" },
    keyVersion: { type: Number, required: true, default: 1 },
    wrappedKey: { type: wrappedKeySchema, required: true },
  },
  { timestamps: true },
);

// The user-scope plugin already adds a plain userId index, so this one is a different index:
// one vault per user per key version. It is what stops two parallel first requests from
// creating two different keys for the same person.
vaultSchema.index({ userId: 1, keyVersion: 1 }, { unique: true });

export const Vault = model<VaultFields>("Vault", vaultSchema);