import type { Request, Response } from "express";
import { Track } from "../models/Track";
import { TrackLog } from "../models/TrackLog";
import { isValidDayKey, isValidMonthKey } from "../utility/dayKey";
import { isRecordId, parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

// Limits apply to the encrypted text, which is longer than the original.
const TRACK_PAYLOAD_MAX = 8_000;
const LOG_PAYLOAD_MAX = 40_000;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

function monthRange(month: string) {
  return { $gte: `${month}-01`, $lte: `${month}-31` };
}

function trackEnvelope(doc: { recordId: string; payload: unknown; createdAt: Date; updatedAt: Date }) {
  return {
    id: doc.recordId,
    payload: plainPayload(doc.payload as StoredPayload),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function logEnvelope(doc: {
  recordId: string;
  trackId: string;
  date: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: doc.recordId,
    trackId: doc.trackId,
    date: doc.date,
    payload: plainPayload(doc.payload as StoredPayload),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function trackExists(id: string): Promise<boolean> {
  return (await Track.exists({ recordId: id })) !== null;
}

// GET /api/tracks?month=2026-09  ->  every track, plus that month's logs, all encrypted.
// The browser decrypts them and works out the days and totals.
export async function listTracks(req: Request, res: Response): Promise<void> {
  const month = req.query.month;
  if (!isValidMonthKey(month)) {
    res.status(400).json({ message: "month is required, like 2026-09" });
    return;
  }

  const [tracks, logs] = await Promise.all([
    Track.find().sort({ createdAt: 1 }).select("recordId payload createdAt updatedAt"),
    TrackLog.find({ date: monthRange(month) }).select("recordId trackId date payload createdAt updatedAt"),
  ]);

  res.status(200).json({ tracks: tracks.map(trackEnvelope), logs: logs.map(logEnvelope) });
}

// POST /api/tracks  { recordId, payload }
export async function createTrack(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const payload = parsePayload(input.payload, TRACK_PAYLOAD_MAX);
  if (!isRecordId(input.recordId) || !payload) {
    res.status(400).json({ message: "Send recordId and payload" });
    return;
  }

  try {
    const doc = await Track.create({ recordId: input.recordId, payload });
    res.status(201).json({ track: { id: doc.recordId, createdAt: doc.createdAt, updatedAt: doc.updatedAt } });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ message: "That track already exists" });
      return;
    }
    throw error;
  }
}

// GET /api/tracks/:id
export async function getTrack(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  const doc = await Track.findOne({ recordId: id });
  if (!doc) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  res.status(200).json({ track: trackEnvelope(doc) });
}

// PUT /api/tracks/:id  { payload }
export async function updateTrack(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  const payload = parsePayload(bodyOf(req).payload, TRACK_PAYLOAD_MAX);
  if (!payload) {
    res.status(400).json({ message: "payload is not valid" });
    return;
  }

  const doc = await Track.findOneAndUpdate({ recordId: id }, { $set: { payload } }, { returnDocument: "after" });
  if (!doc) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  res.status(200).json({ track: { id: doc.recordId, createdAt: doc.createdAt, updatedAt: doc.updatedAt } });
}

// DELETE /api/tracks/:id  ->  removes the track and every log inside it.
export async function deleteTrack(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  const doc = await Track.findOneAndDelete({ recordId: id });
  if (!doc) {
    res.status(404).json({ message: "Track not found" });
    return;
  }
  await TrackLog.deleteMany({ trackId: id });
  res.status(200).json({ deleted: true });
}

// GET /api/tracks/:id/logs?month=2026-09  ->  that month's logs, newest first.
export async function listLogs(req: Request, res: Response): Promise<void> {
  const month = req.query.month;
  if (!isValidMonthKey(month)) {
    res.status(400).json({ message: "month is required, like 2026-09" });
    return;
  }
  const id = req.params.id;
  if (!isRecordId(id) || !(await trackExists(id))) {
    res.status(404).json({ message: "Track not found" });
    return;
  }

  const logs = await TrackLog.find({ trackId: id, date: monthRange(month) }).sort({ date: -1, createdAt: -1 });
  res.status(200).json({ logs: logs.map(logEnvelope) });
}

// POST /api/tracks/:id/logs  { recordId, date, payload }
export async function createLog(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id) || !(await trackExists(id))) {
    res.status(404).json({ message: "Track not found" });
    return;
  }

  const input = bodyOf(req);
  const payload = parsePayload(input.payload, LOG_PAYLOAD_MAX);
  if (!isRecordId(input.recordId) || !isValidDayKey(input.date) || !payload) {
    res.status(400).json({ message: "Send recordId, date and payload" });
    return;
  }

  try {
    const doc = await TrackLog.create({ recordId: input.recordId, trackId: id, date: input.date, payload });
    res.status(201).json({ log: logEnvelope(doc) });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ message: "That log already exists" });
      return;
    }
    throw error;
  }
}

// PUT /api/tracks/:id/logs/:logId  { date, payload }
export async function updateLog(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const logId = req.params.logId;
  if (!isRecordId(id) || !isRecordId(logId)) {
    res.status(404).json({ message: "Log not found" });
    return;
  }

  const input = bodyOf(req);
  const payload = parsePayload(input.payload, LOG_PAYLOAD_MAX);
  if (!isValidDayKey(input.date) || !payload) {
    res.status(400).json({ message: "Send date and payload" });
    return;
  }

  const doc = await TrackLog.findOneAndUpdate(
    { recordId: logId, trackId: id },
    { $set: { date: input.date, payload } },
    { returnDocument: "after" },
  );
  if (!doc) {
    res.status(404).json({ message: "Log not found" });
    return;
  }
  res.status(200).json({ log: logEnvelope(doc) });
}

// DELETE /api/tracks/:id/logs/:logId
export async function deleteLog(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const logId = req.params.logId;
  if (!isRecordId(id) || !isRecordId(logId)) {
    res.status(404).json({ message: "Log not found" });
    return;
  }

  const doc = await TrackLog.findOneAndDelete({ recordId: logId, trackId: id });
  if (!doc) {
    res.status(404).json({ message: "Log not found" });
    return;
  }
  res.status(200).json({ deleted: true });
}

// GET /api/tracks/logs?date=2026-09-23  ->  everything logged on one day, plus the tracks those logs belong to.
export async function listLogsForDay(req: Request, res: Response): Promise<void> {
  const date = req.query.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-09-23" });
    return;
  }

  const logs = await TrackLog.find({ date }).sort({ createdAt: 1 });
  const trackIds = [...new Set(logs.map((log) => log.trackId))];
  const tracks = trackIds.length > 0 ? await Track.find({ recordId: { $in: trackIds } }) : [];

  res.status(200).json({ logs: logs.map(logEnvelope), tracks: tracks.map(trackEnvelope) });
}