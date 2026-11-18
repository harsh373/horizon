import { Schema, model } from "mongoose";

// One document per user. Holds small preferences that aren't tied to a
// specific day, quest, or photo, currently just the home-screen countdown.
export interface SettingsFields {
  key: string;
  countdownDate: string; // "YYYY-MM-DD" or "" for none set
  countdownLabel: string;
  createdAt: Date;
  updatedAt: Date;
}

const SINGLETON_KEY = "singleton";

const settingsSchema = new Schema<SettingsFields>(
  {
    key: { type: String, required: true, default: SINGLETON_KEY },
    countdownDate: { type: String, default: "", match: /^(\d{4}-\d{2}-\d{2})?$/ },
    countdownLabel: { type: String, default: "", maxlength: 120 },
  },
  { timestamps: true },
);

settingsSchema.index({ userId: 1, key: 1 }, { unique: true });

export const Settings = model<SettingsFields>("Settings", settingsSchema);
export { SINGLETON_KEY };