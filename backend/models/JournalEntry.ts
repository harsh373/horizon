import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";

export const MOODS = ["good", "neutral", "tough", "special"] as const;
export type Mood = (typeof MOODS)[number];

// Limits apply to the encrypted text, which is longer than the original (base64 plus JSON wrapping).
export const META_PAYLOAD_MAX = 4_000;
export const BODY_PAYLOAD_MAX = 700_000;

// Photos stay as they are until Phase 5 (photo encryption).
export interface JournalPhoto {
  url: string;
  publicId: string;
  caption?: string;
}

export interface JournalEntryFields {
  // A plain "YYYY-MM-DD" string: one entry per journal day. It is also the record id bound into the ciphertext.
  date: string;
  // {mood, location}, encrypted. Small, so the calendar can load a month cheaply.
  metaPayload?: StoredPayload;
  // {whatIDidToday, whatDrainedMe, tomorrowDifferent, dailySummary}, encrypted.
  // Both payloads are missing on a day that so far only has photos.
  payload?: StoredPayload;
  photos: JournalPhoto[];
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

const photoSchema = new Schema<JournalPhoto>({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  caption: { type: String, maxlength: 500 },
});

const journalEntrySchema = new Schema<JournalEntryFields>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    metaPayload: { type: payloadSchema },
    payload: { type: payloadSchema },
    photos: { type: [photoSchema], default: [] },
  },
  { timestamps: true },
);

// One entry per day, per user.
journalEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export const JournalEntry = model<JournalEntryFields>("JournalEntry", journalEntrySchema);