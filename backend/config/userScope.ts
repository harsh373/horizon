import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import type { Schema } from "mongoose";

const storage = new AsyncLocalStorage<{ userId: string }>();

export function runAsUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

// Fails closed: touching the database without a signed-in user is a bug, so it throws.
export function currentUserId(): string {
  const userId = storage.getStore()?.userId;
  if (!userId) throw new Error("Database access attempted without a signed-in user");
  return userId;
}

const FILTERED_QUERIES = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "countDocuments",
  "distinct",
] as const;

function userScope(schema: Schema): void {
  schema.add({ userId: { type: String, required: true, index: true, immutable: true } });

  // New documents get the current user stamped on before validation runs.
  schema.pre("validate", function () {
    if (this.isNew && !this.get("userId")) this.set("userId", currentUserId());
  });

  // Every read, update and delete is limited to the current user's documents.
  // Upserts also work: MongoDB copies the userId equality from the filter into the new document.
  schema.pre([...FILTERED_QUERIES] as any, function (this: any) {
    this.where({ userId: currentUserId() });
  });

  schema.pre("aggregate" as any, function (this: any) {
    this.pipeline().unshift({ $match: { userId: currentUserId() } });
  });
}

// Child schemas (photos, items, evidence) must NOT get a userId, only top-level models.
mongoose.plugin(userScope, { applyPluginsToChildSchemas: false });