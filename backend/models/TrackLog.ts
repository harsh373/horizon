import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

// One time you showed up for a track. The note and amount are inside the payload.
// trackId (the track's recordId) and date stay readable so the server can fetch a month of logs.
export interface TrackLogFields {
  recordId: string;
  trackId: string;
  date: string;
  payload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const trackLogSchema = new Schema<TrackLogFields>(
  {
    recordId: { type: String, required: true, immutable: true },
    trackId: { type: String, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    payload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

trackLogSchema.index({ userId: 1, recordId: 1 }, { unique: true });
trackLogSchema.index({ userId: 1, trackId: 1, date: 1 });
trackLogSchema.index({ userId: 1, date: 1 });

export const TrackLog = model<TrackLogFields>("TrackLog", trackLogSchema);