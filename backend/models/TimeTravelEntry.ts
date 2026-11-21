import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

export interface TimeTravelEntryFields {
  recordId: string;
  // The journal day key. It stays readable so the per-day escape counts keep working.
  date: string;
  // {futureThought}, encrypted.
  payload: StoredPayload;
  // {presentState}, encrypted. Written after RETURN TO NOW, if at all.
  presentPayload?: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const timeTravelEntrySchema = new Schema<TimeTravelEntryFields>(
  {
    recordId: { type: String, required: true, immutable: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    payload: { type: payloadSchema, required: true },
    presentPayload: { type: payloadSchema },
  },
  { timestamps: true },
);

timeTravelEntrySchema.index({ userId: 1, recordId: 1 }, { unique: true });
timeTravelEntrySchema.index({ userId: 1, date: 1 });

export const TimeTravelEntry = model<TimeTravelEntryFields>("TimeTravelEntry", timeTravelEntrySchema);