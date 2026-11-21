import { Schema, model } from "mongoose";
import type { StoredPayload } from "../utility/payload";
import { payloadSchema } from "./payloadSchema";

// One document per user. The preferences (countdown date and label) are inside the encrypted payload.
export interface SettingsFields {
  key: string;
  payload: StoredPayload;
  createdAt: Date;
  updatedAt: Date;
}

const SINGLETON_KEY = "singleton";

const settingsSchema = new Schema<SettingsFields>(
  {
    key: { type: String, required: true, default: SINGLETON_KEY },
    payload: { type: payloadSchema, required: true },
  },
  { timestamps: true },
);

settingsSchema.index({ userId: 1, key: 1 }, { unique: true });

export const Settings = model<SettingsFields>("Settings", settingsSchema);
export { SINGLETON_KEY };