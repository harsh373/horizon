import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

export interface QuoteFields {
  // Made by the browser, once per "add" session, so a retried save can't create a duplicate.
  recordId: string;
  // {text, author, note}, encrypted.
  payload: StoredPayload;
  // {x, y}, encrypted. Where the landmark sits on the map. Location data, so it is encrypted too.
  pinPayload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const quoteSchema = new Schema<QuoteFields>(
  {
    recordId: { type: String, required: true, immutable: true },
    payload: { type: payloadSchema, required: true },
    pinPayload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

quoteSchema.index({ userId: 1, recordId: 1 }, { unique: true });

export const Quote = model<QuoteFields>("Quote", quoteSchema);