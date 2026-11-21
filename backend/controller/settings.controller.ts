import type { Request, Response } from "express";
import { Settings, SINGLETON_KEY } from "../models/Settings";
import { parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const SETTINGS_PAYLOAD_MAX = 8_000;

// GET /api/settings  ->  the encrypted settings, or { settings: null } if none were saved yet.
export async function getSettings(_req: Request, res: Response): Promise<void> {
  const doc = await Settings.findOne({ key: SINGLETON_KEY });
  res.status(200).json({ settings: doc ? { payload: plainPayload(doc.payload as StoredPayload) } : null });
}

async function upsertSettings(payload: StoredPayload) {
  return Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { payload } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

// PUT /api/settings  { payload }
export async function saveSettings(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const payload = parsePayload(body.payload, SETTINGS_PAYLOAD_MAX);
  if (!payload) {
    res.status(400).json({ message: "payload is not valid" });
    return;
  }

  let doc;
  try {
    doc = await upsertSettings(payload);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await upsertSettings(payload);
  }
  if (!doc) {
    res.status(500).json({ message: "Could not save settings" });
    return;
  }
  res.status(200).json({ ok: true });
}