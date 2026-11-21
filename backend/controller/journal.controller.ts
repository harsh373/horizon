import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { BODY_PAYLOAD_MAX, META_PAYLOAD_MAX, JournalEntry } from "../models/JournalEntry";
import type { JournalEntryFields } from "../models/JournalEntry";
import { isValidDayKey, isValidMonthKey } from "../utility/dayKey";
import { parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const ARCHIVE_PAGE_SIZE = 10;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

function payloadOrNull(value: StoredPayload | null | undefined): StoredPayload | null {
  return value ? plainPayload(value) : null;
}

function photosOf(doc: HydratedDocument<JournalEntryFields>) {
  return doc.photos.map((photo) => ({
    id: String((photo as { _id?: unknown })._id ?? ""),
    url: photo.url,
    publicId: photo.publicId,
    caption: photo.caption,
  }));
}

// GET /api/journal/archive?cursor=2026-09-10  ->  10 days at a time, newest first.
// The server can't see inside the encrypted text, so it can't tell which days are empty. It returns every day
// that has text or photos on record, and the browser drops the ones that turn out to be blank.
export async function listArchive(req: Request, res: Response): Promise<void> {
  const cursor = req.query.cursor;
  const hasContent = { $or: [{ payload: { $exists: true } }, { "photos.0": { $exists: true } }] };
  const filter =
    typeof cursor === "string" && isValidDayKey(cursor) ? { ...hasContent, date: { $lt: cursor } } : hasContent;

  const docs = await JournalEntry.find(filter)
    .sort({ date: -1 })
    .limit(ARCHIVE_PAGE_SIZE + 1)
    .select("date metaPayload payload photos");
  const hasMore = docs.length > ARCHIVE_PAGE_SIZE;
  const page = hasMore ? docs.slice(0, ARCHIVE_PAGE_SIZE) : docs;

  res.status(200).json({
    entries: page.map((doc) => ({
      date: doc.date,
      metaPayload: payloadOrNull(doc.metaPayload),
      payload: payloadOrNull(doc.payload),
      photos: photosOf(doc),
    })),
    nextCursor: hasMore ? (page.at(-1)?.date ?? null) : null,
  });
}

// GET /api/journal?month=2026-09  ->  the days of that month that have an entry, with their encrypted mood.
export async function listEntries(req: Request, res: Response): Promise<void> {
  const month = req.query.month;
  if (!isValidMonthKey(month)) {
    res.status(400).json({ message: "month is required, like 2026-09" });
    return;
  }

  const docs = await JournalEntry.find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } })
    .select("date metaPayload")
    .sort({ date: 1 });

  res.status(200).json({
    entries: docs.map((doc) => ({ date: doc.date, metaPayload: payloadOrNull(doc.metaPayload) })),
  });
}

// GET /api/journal/2026-09-23  ->  the entry, or { entry: null } if that day is still empty.
export async function getEntry(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const doc = await JournalEntry.findOne({ date });
  if (!doc) {
    res.status(200).json({ entry: null });
    return;
  }

  res.status(200).json({
    entry: {
      date: doc.date,
      metaPayload: payloadOrNull(doc.metaPayload),
      payload: payloadOrNull(doc.payload),
      photos: photosOf(doc),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  });
}

async function upsertEntry(date: string, metaPayload: StoredPayload, payload: StoredPayload) {
  return JournalEntry.findOneAndUpdate(
    { date },
    { $set: { metaPayload, payload } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

// PUT /api/journal/2026-09-23  { metaPayload, payload }  ->  create the day on the first save, update it after that.
// One route for both keeps autosave safe: repeating a save can never create a duplicate.
export async function saveEntry(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const input = bodyOf(req);
  const metaPayload = parsePayload(input.metaPayload, META_PAYLOAD_MAX);
  const payload = parsePayload(input.payload, BODY_PAYLOAD_MAX);
  if (!metaPayload || !payload) {
    res.status(400).json({ message: "Send metaPayload and payload" });
    return;
  }

  let doc;
  try {
    doc = await upsertEntry(date, metaPayload, payload);
  } catch (error) {
    // Two saves for a brand-new day can collide on the unique date; trying once more resolves it.
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await upsertEntry(date, metaPayload, payload);
  }

  if (!doc) {
    res.status(500).json({ message: "Could not save the entry" });
    return;
  }
  res.status(200).json({
    entry: { photos: photosOf(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt },
  });
}

// DELETE /api/journal/2026-09-23
export async function deleteEntry(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const doc = await JournalEntry.findOneAndDelete({ date });
  if (!doc) {
    res.status(404).json({ message: "No entry for that day" });
    return;
  }
  res.status(200).json({ deleted: true });
}