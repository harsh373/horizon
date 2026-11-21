import type { Request, Response } from "express";
import { TimeTravelEntry } from "../models/TimeTravelEntry";
import { isValidDayKey } from "../utility/dayKey";
import { isRecordId, parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const THOUGHT_PAYLOAD_MAX = 20_000;
const PRESENT_PAYLOAD_MAX = 12_000;
const RECENT_DAYS = 14;
const ARCHIVE_PAGE_SIZE = 10;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

// POST /api/now/entries  { recordId, date, payload }  ->  records one ENTER FUTURE moment. This is the ONLY
// action that creates a row, and therefore the only thing that affects the count.
export async function createEntry(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const payload = parsePayload(input.payload, THOUGHT_PAYLOAD_MAX);
  if (!isRecordId(input.recordId) || !isValidDayKey(input.date) || !payload) {
    res.status(400).json({ message: "Send recordId, date and payload" });
    return;
  }

  try {
    const doc = await TimeTravelEntry.create({ recordId: input.recordId, date: input.date, payload });
    res.status(201).json({ entry: { id: doc.recordId, date: doc.date, createdAt: doc.createdAt } });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ message: "That entry already exists" });
      return;
    }
    throw error;
  }
}

// PATCH /api/now/entries/:id  { presentPayload }  ->  attaches the optional text written after RETURN TO NOW.
export async function updatePresentState(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(404).json({ message: "No such entry" });
    return;
  }
  const presentPayload = parsePayload(bodyOf(req).presentPayload, PRESENT_PAYLOAD_MAX);
  if (!presentPayload) {
    res.status(400).json({ message: "presentPayload is not valid" });
    return;
  }

  const doc = await TimeTravelEntry.findOneAndUpdate(
    { recordId: id },
    { $set: { presentPayload } },
    { returnDocument: "after" },
  );
  if (!doc) {
    res.status(404).json({ message: "No such entry" });
    return;
  }
  res.status(200).json({
    entry: {
      id: doc.recordId,
      date: doc.date,
      payload: plainPayload(doc.payload as StoredPayload),
      createdAt: doc.createdAt,
    },
  });
}

// GET /api/now/today?date=2026-10-08  ->  the count for that date, counted fresh from the stored entries.
export async function getTodayCount(req: Request, res: Response): Promise<void> {
  const date = req.query.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-10-08" });
    return;
  }

  const count = await TimeTravelEntry.countDocuments({ date });
  res.status(200).json({ date, count });
}

// GET /api/now/recent  ->  escape counts per day, most recent first. Only day keys and counts, nothing written.
export async function getRecent(_req: Request, res: Response): Promise<void> {
  const results = await TimeTravelEntry.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$date", count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: RECENT_DAYS },
  ]);

  res.status(200).json({
    days: results.map((row) => ({ date: row._id, count: row.count })),
  });
}

// GET /api/now/archive?cursor=2026-10-05  ->  every escape, grouped by day, newest first, 10 days per page.
// The thoughts come back encrypted; the browser decrypts them.
export async function getArchive(req: Request, res: Response): Promise<void> {
  const cursor = req.query.cursor;
  const match = typeof cursor === "string" && isValidDayKey(cursor) ? { date: { $lt: cursor } } : {};

  const results = await TimeTravelEntry.aggregate<{
    _id: string;
    count: number;
    entries: { id: string; payload: StoredPayload; createdAt: Date }[];
  }>([
    { $match: match },
    { $sort: { date: -1, createdAt: 1 } },
    {
      $group: {
        _id: "$date",
        count: { $sum: 1 },
        entries: { $push: { id: "$recordId", payload: "$payload", createdAt: "$createdAt" } },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: ARCHIVE_PAGE_SIZE + 1 },
  ]);

  const hasMore = results.length > ARCHIVE_PAGE_SIZE;
  const page = hasMore ? results.slice(0, ARCHIVE_PAGE_SIZE) : results;

  res.status(200).json({
    days: page.map((row) => ({
      date: row._id,
      count: row.count,
      entries: row.entries.map((entry) => ({
        id: entry.id,
        payload: plainPayload(entry.payload),
        createdAt: entry.createdAt,
      })),
    })),
    nextCursor: hasMore ? (page.at(-1)?._id ?? null) : null,
  });
}