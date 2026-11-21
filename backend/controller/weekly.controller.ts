import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { WeeklyPlan } from "../models/WeeklyPlan";
import type { WeeklyPlanFields } from "../models/WeeklyPlan";
import { isValidWeekStart } from "../utility/dayKey";
import { parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const PLAN_PAYLOAD_MAX = 400_000;

function toResponse(doc: HydratedDocument<WeeklyPlanFields>) {
  return {
    weekStart: doc.weekStart,
    payload: plainPayload(doc.payload as StoredPayload),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/weekly/:weekStart  ->  the encrypted plan, or { plan: null } if nothing's been added yet.
export async function getWeeklyPlan(req: Request, res: Response): Promise<void> {
  const weekStart = req.params.weekStart;
  if (!isValidWeekStart(weekStart)) {
    res.status(400).json({ message: "weekStart must be a Monday, like 2026-09-28" });
    return;
  }
  const doc = await WeeklyPlan.findOne({ weekStart });
  res.status(200).json({ plan: doc ? toResponse(doc) : null });
}

async function upsertPlan(weekStart: string, payload: StoredPayload) {
  return WeeklyPlan.findOneAndUpdate(
    { weekStart },
    { $set: { payload } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );
}

// PUT /api/weekly/:weekStart  { payload }  ->  create the plan on the first save, replace it after that.
// Adding, editing, deleting and reordering items all save the whole plan, so there is no separate reorder route.
export async function saveWeeklyPlan(req: Request, res: Response): Promise<void> {
  const weekStart = req.params.weekStart;
  if (!isValidWeekStart(weekStart)) {
    res.status(400).json({ message: "weekStart must be a Monday, like 2026-09-28" });
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
    doc = await upsertPlan(weekStart, payload);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await upsertPlan(weekStart, payload);
  }
  if (!doc) {
    res.status(500).json({ message: "Could not save the plan" });
    return;
  }
  res.status(200).json({ plan: toResponse(doc) });
}