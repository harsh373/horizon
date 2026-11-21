import type { DayKey } from "../config/dates";
import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord } from "../crypto/vaultSession";
import { api } from "./api";

export type Mood = "good" | "neutral" | "tough" | "special";

const MOODS: readonly string[] = ["good", "neutral", "tough", "special"];
const META_KIND = "journal-meta";
const BODY_KIND = "journal";
const ARCHIVE_TARGET = 10;
const MAX_RAW_PAGES = 50;

export interface JournalPhoto {
  id: string;
  url: string;
  publicId: string;
  caption?: string;
}
export interface ArchiveEntry {
  date: DayKey;
  mood: Mood;
  dailySummary: string;
  whatIDidToday: string;
  whatDrainedMe: string;
  tomorrowDifferent: string;
  photos: JournalPhoto[];
}

// The parts of a day that you write. The editor saves exactly these.
export interface EntryFields {
  whatIDidToday: string;
  whatDrainedMe: string;
  tomorrowDifferent: string;
  dailySummary: string;
  mood: Mood;
  location: string;
}

export interface JournalEntry extends EntryFields {
  id: string;
  date: DayKey;
  photos: JournalPhoto[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MetaValue {
  mood: Mood;
  location: string;
}

interface BodyValue {
  whatIDidToday: string;
  whatDrainedMe: string;
  tomorrowDifferent: string;
  dailySummary: string;
}

function isMood(value: unknown): value is Mood {
  return typeof value === "string" && MOODS.includes(value);
}

// A day with no payloads yet (only photos so far) reads as an empty, neutral day.
async function decodeFields(
  date: DayKey,
  metaPayload: EncryptedPayload | null,
  payload: EncryptedPayload | null,
): Promise<EntryFields> {
  const [meta, body] = await Promise.all([
    metaPayload ? decryptRecord<MetaValue>(META_KIND, date, metaPayload) : Promise.resolve(null),
    payload ? decryptRecord<BodyValue>(BODY_KIND, date, payload) : Promise.resolve(null),
  ]);
  return {
    whatIDidToday: body?.whatIDidToday ?? "",
    whatDrainedMe: body?.whatDrainedMe ?? "",
    tomorrowDifferent: body?.tomorrowDifferent ?? "",
    dailySummary: body?.dailySummary ?? "",
    mood: meta && isMood(meta.mood) ? meta.mood : "neutral",
    location: meta?.location ?? "",
  };
}

function hasContent(entry: ArchiveEntry): boolean {
  return (
    entry.dailySummary !== "" ||
    entry.whatIDidToday !== "" ||
    entry.whatDrainedMe !== "" ||
    entry.tomorrowDifferent !== "" ||
    entry.photos.length > 0
  );
}

interface RawArchiveEntry {
  date: DayKey;
  metaPayload: EncryptedPayload | null;
  payload: EncryptedPayload | null;
  photos: JournalPhoto[];
}

async function decodeArchiveEntry(raw: RawArchiveEntry): Promise<ArchiveEntry> {
  try {
    const fields = await decodeFields(raw.date, raw.metaPayload, raw.payload);
    return {
      date: raw.date,
      mood: fields.mood,
      dailySummary: fields.dailySummary,
      whatIDidToday: fields.whatIDidToday,
      whatDrainedMe: fields.whatDrainedMe,
      tomorrowDifferent: fields.tomorrowDifferent,
      photos: raw.photos,
    };
  } catch {
    // One damaged day must not hide the rest of the archive.
    return {
      date: raw.date,
      mood: "neutral",
      dailySummary: "",
      whatIDidToday: "(this day couldn't be decrypted)",
      whatDrainedMe: "",
      tomorrowDifferent: "",
      photos: raw.photos,
    };
  }
}

// The server can't tell which days are empty any more, so this keeps fetching raw pages until
// it has about ten days with something in them. A page is always consumed whole, so the cursor stays exact.
export async function fetchArchivePage(
  cursor: DayKey | null,
): Promise<{ entries: ArchiveEntry[]; nextCursor: DayKey | null }> {
  const entries: ArchiveEntry[] = [];
  let next: DayKey | null = cursor;
  let rounds = 0;

  do {
    const { data } = await api.get<{ entries: RawArchiveEntry[]; nextCursor: DayKey | null }>("/journal/archive", {
      params: next ? { cursor: next } : undefined,
    });
    const decoded = await Promise.all(data.entries.map(decodeArchiveEntry));
    entries.push(...decoded.filter(hasContent));
    next = data.nextCursor;
    rounds += 1;
  } while (entries.length < ARCHIVE_TARGET && next && rounds < MAX_RAW_PAGES);

  return { entries, nextCursor: next };
}

// null means nothing has been written for that day yet.
// If decryption fails this throws, so the editor shows its error screen instead of a blank day that could overwrite the real one.
export async function fetchEntry(date: DayKey): Promise<JournalEntry | null> {
  const { data } = await api.get<{
    entry: {
      date: DayKey;
      metaPayload: EncryptedPayload | null;
      payload: EncryptedPayload | null;
      photos: JournalPhoto[];
      createdAt: string;
      updatedAt: string;
    } | null;
  }>(`/journal/${date}`);

  const raw = data.entry;
  if (!raw) return null;

  const fields = await decodeFields(date, raw.metaPayload, raw.payload);
  return {
    ...fields,
    id: date,
    date,
    photos: raw.photos,
    tags: [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function saveEntry(date: DayKey, fields: EntryFields): Promise<JournalEntry> {
  const [metaPayload, payload] = await Promise.all([
    encryptRecord(META_KIND, date, { mood: fields.mood, location: fields.location.trim() } satisfies MetaValue),
    encryptRecord(BODY_KIND, date, {
      whatIDidToday: fields.whatIDidToday,
      whatDrainedMe: fields.whatDrainedMe,
      tomorrowDifferent: fields.tomorrowDifferent,
      dailySummary: fields.dailySummary,
    } satisfies BodyValue),
  ]);

  const { data } = await api.put<{ entry: { photos: JournalPhoto[]; createdAt: string; updatedAt: string } }>(
    `/journal/${date}`,
    { metaPayload, payload },
  );

  return {
    ...fields,
    id: date,
    date,
    photos: data.entry.photos,
    tags: [],
    createdAt: data.entry.createdAt,
    updatedAt: data.entry.updatedAt,
  };
}

// The mood of every written day in one month, for the calendar dots.
export async function fetchMonthMoods(year: number, month: number): Promise<Record<DayKey, Mood>> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const { data } = await api.get<{ entries: { date: DayKey; metaPayload: EncryptedPayload | null }[] }>("/journal", {
    params: { month: key },
  });

  const moods: Record<DayKey, Mood> = {};
  await Promise.all(
    data.entries.map(async (entry) => {
      try {
        if (!entry.metaPayload) {
          moods[entry.date] = "neutral";
          return;
        }
        const meta = await decryptRecord<MetaValue>(META_KIND, entry.date, entry.metaPayload);
        moods[entry.date] = isMood(meta.mood) ? meta.mood : "neutral";
      } catch {
        // A day that can't be read simply gets no dot.
      }
    }),
  );
  return moods;
}