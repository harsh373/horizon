import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

// A Track is something you keep doing. Title, subtitle, icon, unit and status are all inside the payload.
export interface TrackFields {
  // Made by the browser. It is bound into the ciphertext, so it can never change.
  recordId: string;
  payload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const trackSchema = new Schema<TrackFields>(
  {
    recordId: { type: String, required: true, immutable: true },
    payload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

trackSchema.index({ userId: 1, recordId: 1 }, { unique: true });

export const Track = model<TrackFields>("Track", trackSchema);