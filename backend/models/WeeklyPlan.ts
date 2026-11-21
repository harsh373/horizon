import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

export interface WeeklyPlanFields {
  // The Monday of the week, as "YYYY-MM-DD". It is also the record id bound into the ciphertext.
  weekStart: string;
  // {items: [{id, text, completed}]}, encrypted. The order of the list is the order of the items.
  payload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const weeklyPlanSchema = new Schema<WeeklyPlanFields>(
  {
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    payload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

weeklyPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const WeeklyPlan = model<WeeklyPlanFields>("WeeklyPlan", weeklyPlanSchema);