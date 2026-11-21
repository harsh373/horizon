import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { TodayPlan } from "../models/TodayPlan";
import type { TodayPlanFields } from "../models/TodayPlan";
import { isValidDayKey } from "../utility/dayKey";
import { parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

// The whole plan is one encrypted document (up to 200 items of 500 characters).
const PLAN_PAYLOAD_MAX = 400_000;

function toResponse(doc: HydratedDocument<TodayPlanFields>) {
  return {
    date: doc.date,
    payload: plainPayload(doc.payload as StoredPayload),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/today/:date  ->  the encrypted plan, or { plan: null } if nothing's been added yet.
export async function getTodayPlan(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-10-01" });
    return;
  }
  const doc = await TodayPlan.findOne({ date });
  res.status(200).json({ plan: doc ? toResponse(doc) : null });
}

async function upsertPlan(date: string, payload: StoredPayload) {
  return TodayPlan.findOneAndUpdate(
    { date },
    { $set: { payload } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

// PUT /api/today/:date  { payload }  ->  create the plan on the first save, replace it after that.
export async function saveTodayPlan(req: Request, res: Response): Promise<void> {
  const date = req.params.date;
  if (!isValidDayKey(date)) {
    res.status(400).json({ message: "date must look like 2026-10-01" });
    return;
  }
  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const payload = parsePayload(body.payload, PLAN_PAYLOAD_MAX);
  if (!payload) {
    res.status(400).json({ message: "payload is not valid" });
    return;
  }

  let doc;
  try {
    doc = await upsertPlan(date, payload);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await upsertPlan(date, payload);
  }
  if (!doc) {
    res.status(500).json({ message: "Could not save the plan" });
    return;
  }
  res.status(200).json({ plan: toResponse(doc) });
}