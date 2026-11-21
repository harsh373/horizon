import type { Request, Response } from "express";
import { currentUserId } from "../config/userScope";
import { BODY_PAYLOAD_MAX, TITLE_PAYLOAD_MAX, Thought } from "../models/Thought";
import { isRecordId, parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const MAX_REORDER = 5000;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

// New thoughts go to the top of the collection.
async function topOrder(): Promise<number> {
  const first = await Thought.findOne().sort({ order: 1 }).select("order");
  return first ? first.order - 1 : 0;
}

// GET /api/thoughts  ->  encrypted titles only, in order. The browser decrypts them and hides empty drafts.
export async function listThoughts(_req: Request, res: Response): Promise<void> {
  const docs = await Thought.find({ recordId: { $exists: true } })
    .sort({ order: 1, createdAt: -1 })
    .select("recordId titlePayload");

  res.status(200).json({
    thoughts: docs.map((doc) => ({ id: doc.recordId, titlePayload: plainPayload(doc.titlePayload as StoredPayload) })),
  });
}

// POST /api/thoughts  { recordId, titlePayload, bodyPayload }  ->  an empty thought, made by the browser.
export async function createThought(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const recordId = input.recordId;
  const titlePayload = parsePayload(input.titlePayload, TITLE_PAYLOAD_MAX);
  const bodyPayload = parsePayload(input.bodyPayload, BODY_PAYLOAD_MAX);

  if (!isRecordId(recordId) || !titlePayload || !bodyPayload) {
    res.status(400).json({ message: "Send recordId, titlePayload and bodyPayload" });
    return;
  }

  try {
    await Thought.create({ recordId, order: await topOrder(), titlePayload, bodyPayload });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ message: "That thought already exists" });
      return;
    }
    throw error;
  }

  res.status(201).json({ thought: { id: recordId } });
}

// GET /api/thoughts/:id
export async function getThought(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(400).json({ message: "Not a valid id" });
    return;
  }
  const doc = await Thought.findOne({ recordId: id });
  if (!doc) {
    res.status(404).json({ message: "That thought no longer exists" });
    return;
  }
  res.status(200).json({
    thought: {
      id: doc.recordId,
      titlePayload: plainPayload(doc.titlePayload as StoredPayload),
      bodyPayload: plainPayload(doc.bodyPayload as StoredPayload),
    },
  });
}

// PATCH /api/thoughts/:id  { titlePayload?, bodyPayload? }
export async function updateThought(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(400).json({ message: "Not a valid id" });
    return;
  }

  const input = bodyOf(req);
  const changes: { titlePayload?: StoredPayload; bodyPayload?: StoredPayload } = {};

  if (input.titlePayload !== undefined) {
    const parsed = parsePayload(input.titlePayload, TITLE_PAYLOAD_MAX);
    if (!parsed) {
      res.status(400).json({ message: "titlePayload is not valid" });
      return;
    }
    changes.titlePayload = parsed;
  }
  if (input.bodyPayload !== undefined) {
    const parsed = parsePayload(input.bodyPayload, BODY_PAYLOAD_MAX);
    if (!parsed) {
      res.status(400).json({ message: "bodyPayload is not valid" });
      return;
    }
    changes.bodyPayload = parsed;
  }
  if (!changes.titlePayload && !changes.bodyPayload) {
    res.status(400).json({ message: "Nothing to save" });
    return;
  }

  const doc = await Thought.findOneAndUpdate({ recordId: id }, { $set: changes }, { returnDocument: "after" }).select(
    "recordId",
  );
  if (!doc) {
    res.status(404).json({ message: "That thought no longer exists" });
    return;
  }
  res.status(200).json({ ok: true });
}

// PUT /api/thoughts/order  { ids: string[] }  ->  the collection in exactly this order.
export async function reorderThoughts(req: Request, res: Response): Promise<void> {
  const ids: unknown = bodyOf(req).ids;

  if (
    !Array.isArray(ids) ||
    ids.length > MAX_REORDER ||
    !ids.every((value) => isRecordId(value)) ||
    new Set(ids).size !== ids.length
  ) {
    res.status(400).json({ message: "ids must be a list of unique thought ids" });
    return;
  }

  const list = ids as string[];
  if (list.length > 0) {
    // bulkWrite is NOT covered by the user-scope plugin, so the user is added to every filter by hand.
    const userId = currentUserId();
    await Thought.bulkWrite(
      list.map((id, index) => ({
        updateOne: { filter: { userId, recordId: id }, update: { $set: { order: index } } },
      })),
    );
  }
  res.status(200).json({ ok: true });
}

// DELETE /api/thoughts/:id
export async function deleteThought(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(400).json({ message: "Not a valid id" });
    return;
  }
  const doc = await Thought.findOneAndDelete({ recordId: id });
  if (!doc) {
    res.status(404).json({ message: "That thought no longer exists" });
    return;
  }
  res.status(200).json({ deleted: true });
}