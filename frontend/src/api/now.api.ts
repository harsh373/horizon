import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord } from "../crypto/vaultSession";
import { api } from "./api";

const THOUGHT_KIND = "now-thought";
const PRESENT_KIND = "now-present";
const THOUGHT_LIMIT = 2000;
const PRESENT_LIMIT = 1000;

export interface TimeTravelEntry {
  id: string;
  date: string;
  futureThought: string;
  presentState?: string;
  createdAt: string;
}

interface ThoughtValue {
  futureThought: string;
}

interface PresentValue {
  presentState: string;
}

export async function createTimeTravelEntry(date: string, futureThought: string): Promise<TimeTravelEntry> {
  const text = futureThought.trim();
  if (!text) throw new Error("futureThought is required");
  if (text.length > THOUGHT_LIMIT) throw new Error("futureThought is too long");

  const id = crypto.randomUUID();
  const payload = await encryptRecord(THOUGHT_KIND, id, { futureThought: text } satisfies ThoughtValue);
  const { data } = await api.post<{ entry: { id: string; date: string; createdAt: string } }>("/now/entries", {
    recordId: id,
    date,
    payload,
  });
  return { id, date, futureThought: text, createdAt: data.entry.createdAt };
}

export async function attachPresentState(entryId: string, presentState: string): Promise<TimeTravelEntry> {
  const text = presentState.trim();
  if (!text) throw new Error("presentState is required");
  if (text.length > PRESENT_LIMIT) throw new Error("presentState is too long");

  const presentPayload = await encryptRecord(PRESENT_KIND, entryId, { presentState: text } satisfies PresentValue);
  const { data } = await api.patch<{
    entry: { id: string; date: string; payload: EncryptedPayload; createdAt: string };
  }>(`/now/entries/${entryId}`, { presentPayload });

  const thought = await decryptRecord<ThoughtValue>(THOUGHT_KIND, entryId, data.entry.payload);
  return {
    id: entryId,
    date: data.entry.date,
    futureThought: thought.futureThought,
    presentState: text,
    createdAt: data.entry.createdAt,
  };
}

// The count and the recent list only use day keys and counts, which the server keeps readable.
export async function fetchTodayEscapeCount(date: string): Promise<number> {
  const { data } = await api.get<{ date: string; count: number }>("/now/today", { params: { date } });
  return data.count;
}

export interface RecentDay {
  date: string;
  count: number;
}

export async function fetchRecentEscapes(): Promise<RecentDay[]> {
  const { data } = await api.get<{ days: RecentDay[] }>("/now/recent");
  return data.days;
}

export interface NowArchiveEntry {
  id: string;
  futureThought: string;
  createdAt: string;
}

export interface NowArchiveDay {
  date: string;
  count: number;
  entries: NowArchiveEntry[];
}

export async function fetchNowArchivePage(
  cursor: string | null,
): Promise<{ days: NowArchiveDay[]; nextCursor: string | null }> {
  const { data } = await api.get<{
    days: { date: string; count: number; entries: { id: string; payload: EncryptedPayload; createdAt: string }[] }[];
    nextCursor: string | null;
  }>("/now/archive", { params: cursor ? { cursor } : undefined });

  const days = await Promise.all(
    data.days.map(async (day) => ({
      date: day.date,
      count: day.count,
      entries: await Promise.all(
        day.entries.map(async (entry) => {
          try {
            const value = await decryptRecord<ThoughtValue>(THOUGHT_KIND, entry.id, entry.payload);
            return { id: entry.id, futureThought: value.futureThought, createdAt: entry.createdAt };
          } catch {
            // One damaged entry must not hide the rest of the day.
            return { id: entry.id, futureThought: "(couldn't be decrypted)", createdAt: entry.createdAt };
          }
        }),
      ),
    })),
  );

  return { days, nextCursor: data.nextCursor };
}