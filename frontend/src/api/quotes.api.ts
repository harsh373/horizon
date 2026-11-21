import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord } from "../crypto/vaultSession";
import { api } from "./api";

export const QUOTE_LIMITS = { text: 2000, author: 120, note: 500 } as const;

const TEXT_KIND = "quote";
const PIN_KIND = "quote-pin";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Quote {
  id: string;
  text: string;
  author: string;
  note: string;
  // Where the landmark sits in the world. Visual only, but it is location data, so it is encrypted.
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

// The parts you write. The editor saves exactly these.
export interface QuoteFields {
  text: string;
  author: string;
  note: string;
}

interface PinValue {
  x: number;
  y: number;
}

interface RawQuote {
  id: string;
  payload: EncryptedPayload;
  pinPayload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

function cleanFields(fields: QuoteFields): QuoteFields {
  const text = fields.text.replace(/\r\n/g, "\n").trim();
  const author = fields.author.trim();
  const note = fields.note.trim();
  if (!text) throw new Error("The quote can't be empty");
  if (text.length > QUOTE_LIMITS.text) throw new Error("The quote is too long");
  if (author.length > QUOTE_LIMITS.author) throw new Error("The author is too long");
  if (note.length > QUOTE_LIMITS.note) throw new Error("The note is too long");
  return { text, author, note };
}

async function decodeQuote(raw: RawQuote): Promise<Quote> {
  const [fields, pin] = await Promise.all([
    decryptRecord<QuoteFields>(TEXT_KIND, raw.id, raw.payload),
    decryptRecord<PinValue>(PIN_KIND, raw.id, raw.pinPayload),
  ]);
  return {
    id: raw.id,
    text: fields.text,
    author: fields.author,
    note: fields.note,
    x: pin.x,
    y: pin.y,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function fetchQuotes(): Promise<Quote[]> {
  const { data } = await api.get<{ quotes: RawQuote[] }>("/quotes");
  // One damaged quote must not hide the rest of the map.
  const settled = await Promise.allSettled(data.quotes.map(decodeQuote));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

// clientKey becomes the record id, which makes a retry safe: if the first request got through but the
// reply was lost, sending it again returns the same quote instead of creating a duplicate.
export async function createQuote(fields: QuoteFields & { x: number; y: number; clientKey: string }): Promise<Quote> {
  const clean = cleanFields(fields);
  if (!Number.isFinite(fields.x) || !Number.isFinite(fields.y)) throw new Error("x and y must be numbers");

  const id = UUID.test(fields.clientKey) ? fields.clientKey : crypto.randomUUID();
  const [payload, pinPayload] = await Promise.all([
    encryptRecord(TEXT_KIND, id, clean),
    encryptRecord(PIN_KIND, id, { x: fields.x, y: fields.y } satisfies PinValue),
  ]);

  const { data } = await api.post<{ quote: { id: string; createdAt: string; updatedAt: string } }>("/quotes", {
    recordId: id,
    payload,
    pinPayload,
  });
  return { id, ...clean, x: fields.x, y: fields.y, createdAt: data.quote.createdAt, updatedAt: data.quote.updatedAt };
}

// Edits the words only. The landmark's position is never sent, so it can't change.
export async function updateQuote(id: string, fields: QuoteFields): Promise<Quote> {
  const clean = cleanFields(fields);
  const payload = await encryptRecord(TEXT_KIND, id, clean);
  const { data } = await api.put<{ quote: RawQuote }>(`/quotes/${id}`, { payload });
  return decodeQuote(data.quote);
}

export async function deleteQuote(id: string): Promise<void> {
  await api.delete(`/quotes/${id}`);
}