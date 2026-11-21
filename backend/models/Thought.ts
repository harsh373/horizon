import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";

// Limits apply to the encrypted text, which is longer than the original (base64 plus JSON wrapping).
export const TITLE_PAYLOAD_MAX = 4_000;
export const BODY_PAYLOAD_MAX = 700_000;

export interface ThoughtFields {
  // Made by the browser. It is bound into the ciphertext, so it can never change.
  recordId: string;
  // Lower comes first. New thoughts are placed above the current first one.
  order: number;
  // {title, hasBody}, encrypted. Small, so the list can load without downloading bodies.
  titlePayload: StoredPayload;
  // {body}, encrypted. Loaded only when a thought is opened.
  bodyPayload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const payloadSchema = new Schema<StoredPayload>(
  {
    v: { type: Number, required: true },
    iv: { type: String, required: true, maxlength: 64 },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);

const thoughtSchema = new Schema<ThoughtFields>(
  {
    recordId: { type: String, required: true, immutable: true },
    order: { type: Number, required: true, default: 0 },
    titlePayload: { type: payloadSchema, required: true },
    bodyPayload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

thoughtSchema.index({ userId: 1, recordId: 1 }, { unique: true });
thoughtSchema.index({ userId: 1, order: 1 });

export const Thought = model<ThoughtFields>("Thought", thoughtSchema);