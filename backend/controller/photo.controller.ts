import type { Request, Response } from "express";
import { JournalEntry } from "../models/JournalEntry";
import { isValidDayKey } from "../utility/dayKey";
import { isRecordId, parsePayload } from "../utility/payload";
import { destroyPhotoAssets, requestUserId, sealedPhotosOf, signPhotoUpload } from "../utility/photoAssets";

const MAX_PHOTOS_PER_DAY = 2;
// Encrypted {date, caption, width, height, mime}. A 500 character caption is the biggest part.
const PHOTO_META_MAX = 8_000;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

// Makes sure the day exists, so a photo can be the first thing saved on a day, like the text autosave.
async function ensureEntry(date: string): Promise<void> {
  const run = () => JournalEntry.updateOne({ date }, { $setOnInsert: { date } }, { upsert: true });
  try {
    await run();
  } catch (error) {
    // Two requests creating the same new day can collide on the unique index; once more resolves it.
    if ((error as { code?: number }).code !== 11000) throw error;
    await run();
  }
}

// POST /api/journal/:date/photos/sign  { recordId }
// Early check only. The real cap is enforced atomically when the photo is registered.
export async function signJournalPhoto(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const recordId = bodyOf(req).recordId;
  if (!isRecordId(recordId)) {
    res.status(400).json({ message: "recordId must be a lowercase UUID" });
    return;
  }

  const entry = await JournalEntry.findOne({ date }).select("sealedPhotos");
  if ((entry?.sealedPhotos.length ?? 0) >= MAX_PHOTOS_PER_DAY) {
    res.status(400).json({ message: `A day can hold at most ${MAX_PHOTOS_PER_DAY} photos` });
    return;
  }

  res.status(200).json(signPhotoUpload(requestUserId(req), recordId));
}

// POST /api/journal/:date/photos  { recordId, payload }
// Called after both ciphertext files are on Cloudinary. Registering the same photo twice is harmless.
export async function registerJournalPhoto(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const input = bodyOf(req);
  const recordId = input.recordId;
  const payload = parsePayload(input.payload, PHOTO_META_MAX);
  if (!isRecordId(recordId) || !payload) {
    res.status(400).json({ message: "Send recordId and payload" });
    return;
  }

  const userId = requestUserId(req);
  await ensureEntry(date);

  // One atomic step: not already there, and still room for another photo.
  const updated = await JournalEntry.findOneAndUpdate(
    {
      date,
      "sealedPhotos.recordId": { $ne: recordId },
      [`sealedPhotos.${MAX_PHOTOS_PER_DAY - 1}`]: { $exists: false },
    },
    { $push: { sealedPhotos: { recordId, payload } } },
    { returnDocument: "after" },
  );

  if (!updated) {
    const current = await JournalEntry.findOne({ date });
    const already = current?.sealedPhotos.find((photo) => photo.recordId === recordId);
    if (already) {
      res.status(200).json({ photo: sealedPhotosOf(userId, [already])[0] });
      return;
    }
    res.status(400).json({ message: `A day can hold at most ${MAX_PHOTOS_PER_DAY} photos` });
    return;
  }

  const saved = updated.sealedPhotos.find((photo) => photo.recordId === recordId);
  if (!saved) {
    res.status(500).json({ message: "Could not attach the photo" });
    return;
  }
  res.status(201).json({ photo: sealedPhotosOf(userId, [saved])[0] });
}

// DELETE /api/journal/:date/photos/:photoId
// Safe to call twice. The browser also uses it to clean up when an upload half-failed.
export async function deleteJournalPhoto(req: Request, res: Response): Promise<void> {
  const { date, photoId } = req.params;
  if (!isValidDayKey(date) || !isRecordId(photoId)) {
    res.status(400).json({ message: "Bad date or photo id" });
    return;
  }

  await JournalEntry.updateOne({ date }, { $pull: { sealedPhotos: { recordId: photoId } } });
  await destroyPhotoAssets(requestUserId(req), photoId);

  res.status(200).json({ deleted: true });
}