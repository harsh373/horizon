import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { Quote } from "../models/Quote";
import type { QuoteFields } from "../models/Quote";
import { isRecordId, parsePayload, plainPayload } from "../utility/payload";
import type { StoredPayload } from "../utility/payload";

const TEXT_PAYLOAD_MAX = 40_000;
const PIN_PAYLOAD_MAX = 2_000;

function bodyOf(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

function toResponse(doc: HydratedDocument<QuoteFields>) {
  return {
    id: doc.recordId,
    payload: plainPayload(doc.payload as StoredPayload),
    pinPayload: plainPayload(doc.pinPayload as StoredPayload),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// GET /api/quotes  ->  every quote, oldest first, all encrypted.
export async function listQuotes(_req: Request, res: Response): Promise<void> {
  const docs = await Quote.find().sort({ createdAt: 1 });
  res.status(200).json({ quotes: docs.map(toResponse) });
}

async function createOnce(recordId: string, payload: StoredPayload, pinPayload: StoredPayload) {
  return Quote.findOneAndUpdate(
    { recordId },
    { $setOnInsert: { payload, pinPayload } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

// POST /api/quotes  { recordId, payload, pinPayload }
// The same recordId twice means the same quote: repeating a save can never create a duplicate.
export async function createQuote(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const payload = parsePayload(input.payload, TEXT_PAYLOAD_MAX);
  const pinPayload = parsePayload(input.pinPayload, PIN_PAYLOAD_MAX);
  if (!isRecordId(input.recordId) || !payload || !pinPayload) {
    res.status(400).json({ message: "Send recordId, payload and pinPayload" });
    return;
  }

  let doc;
  try {
    doc = await createOnce(input.recordId, payload, pinPayload);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await createOnce(input.recordId, payload, pinPayload);
  }
  if (!doc) {
    res.status(500).json({ message: "Could not save the quote" });
    return;
  }
  res.status(201).json({ quote: { id: doc.recordId, createdAt: doc.createdAt, updatedAt: doc.updatedAt } });
}

// PUT /api/quotes/:id  { payload }  ->  edit the words. The pin is never touched here.
export async function updateQuote(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(400).json({ message: "Not a valid quote id" });
    return;
  }
  const payload = parsePayload(bodyOf(req).payload, TEXT_PAYLOAD_MAX);
  if (!payload) {
    res.status(400).json({ message: "payload is not valid" });
    return;
  }

  const doc = await Quote.findOneAndUpdate({ recordId: id }, { $set: { payload } }, { returnDocument: "after" });
  if (!doc) {
    res.status(404).json({ message: "Quote not found" });
    return;
  }
  res.status(200).json({ quote: toResponse(doc) });
}

// DELETE /api/quotes/:id
export async function deleteQuote(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!isRecordId(id)) {
    res.status(400).json({ message: "Not a valid quote id" });
    return;
  }
  const doc = await Quote.findOneAndDelete({ recordId: id });
  if (!doc) {
    res.status(404).json({ message: "Quote not found" });
    return;
  }
  res.status(200).json({ deleted: true });
}