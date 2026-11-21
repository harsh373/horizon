import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

export interface TodayPlanFields {
  // A plain "YYYY-MM-DD" journal day key. It is also the record id bound into the ciphertext.
  date: string;
  // {items: [{id, text, completed}]}, encrypted.
  payload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const todayPlanSchema = new Schema<TodayPlanFields>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    payload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

todayPlanSchema.index({ userId: 1, date: 1 }, { unique: true });

export const TodayPlan = model<TodayPlanFields>("TodayPlan", todayPlanSchema);