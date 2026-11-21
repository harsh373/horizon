import type { DayKey } from "../config/dates";
import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord, onVaultCleared } from "../crypto/vaultSession";
import { api } from "./api";
import { serialize } from "./queue";

export type TrackStatus = "active" | "paused" | "archived";

export type TrackIconKey =
  | "code"
  | "brain"
  | "leaf"
  | "dumbbell"
  | "book"
  | "music"
  | "rocket"
  | "pen"
  | "target"
  | "heart"
  | "briefcase"
  | "camera"
  | "languages"
  | "timer"
  | "sparkles"
  | "coffee";

export interface Track {
  id: string;
  title: string;
  subtitle: string;
  icon: TrackIconKey;
  unit: string;
  status: TrackStatus;
  createdAt: string;
  updatedAt: string;
}

// What the Tracks list needs: the track plus how the current month went.
export interface TrackWithMonth extends Track {
  monthDays: DayKey[];
  monthTotal: number;
}

export interface TrackPatch {
  title?: string;
  subtitle?: string;
  icon?: TrackIconKey;
  unit?: string;
  status?: TrackStatus;
}

export interface TrackLog {
  id: string;
  trackId: string;
  date: DayKey;
  note: string;
  amount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogValues {
  date: DayKey;
  note: string;
  amount: number | null;
}

// A log together with the track it belongs to (used on the journal day page).
export interface DayTrackLog extends TrackLog {
  track: { id: string; title: string; icon: TrackIconKey; unit: string };
}

export function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// 3 -> "3 problems", 2.5 -> "2.5 min". With no unit it is just the number.
export function formatAmount(amount: number, unit: string): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  return unit ? `${value} ${unit}` : value;
}

// ---- encryption ------------------------------------------------------------------------------

const TRACK_KIND = "track";
const LOG_KIND = "track-log";
const LIMITS = { title: 60, subtitle: 160, unit: 20, note: 5_000, amountMax: 1_000_000 } as const;

interface TrackValue {
  title: string;
  subtitle: string;
  icon: TrackIconKey;
  unit: string;
  status: TrackStatus;
}

// trackId and date are repeated inside the ciphertext, so the server can't move a log to another track or day unnoticed.
interface LogValue {
  trackId: string;
  date: DayKey;
  note: string;
  amount: number | null;
}

interface RawTrack {
  id: string;
  payload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

interface RawLog {
  id: string;
  trackId: string;
  date: DayKey;
  payload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

// The last known value of each track, so a partial update can be merged without another request.
const trackCache = new Map<string, TrackValue>();
onVaultCleared(() => trackCache.clear());

function cleanText(value: string, max: number, required: boolean, name: string): string {
  const text = value.trim();
  if (required && text === "") throw new Error(`${name} can't be empty`);
  if (text.length > max) throw new Error(`${name} is too long`);
  return text;
}

function cleanLog(values: LogValues): LogValues {
  const note = values.note;
  if (note.length > LIMITS.note) throw new Error("note is too long");
  const amount = values.amount;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > LIMITS.amountMax)) {
    throw new Error("amount is out of range");
  }
  return { date: values.date, note, amount };
}

async function decodeTrack(raw: RawTrack): Promise<Track> {
  const value = await decryptRecord<TrackValue>(TRACK_KIND, raw.id, raw.payload);
  trackCache.set(raw.id, value);
  return {
    id: raw.id,
    title: value.title,
    subtitle: value.subtitle,
    icon: value.icon,
    unit: value.unit,
    status: value.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function decodeLog(raw: RawLog): Promise<TrackLog> {
  const value = await decryptRecord<LogValue>(LOG_KIND, raw.id, raw.payload);
  if (value.trackId !== raw.trackId || value.date !== raw.date) {
    throw new Error("A log does not match its record");
  }
  return {
    id: raw.id,
    trackId: raw.trackId,
    date: raw.date,
    note: value.note,
    amount: value.amount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

// One damaged record must not hide the rest, so anything that fails to decrypt is skipped.
async function decodeAll<R, T>(items: R[], decode: (item: R) => Promise<T>): Promise<T[]> {
  const settled = await Promise.allSettled(items.map(decode));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

// ---- tracks ----------------------------------------------------------------------------------

export async function fetchTracks(month: string): Promise<TrackWithMonth[]> {
  const { data } = await api.get<{ tracks: RawTrack[]; logs: RawLog[] }>("/tracks", { params: { month } });
  const [tracks, logs] = await Promise.all([decodeAll(data.tracks, decodeTrack), decodeAll(data.logs, decodeLog)]);

  const stats = new Map<string, { days: Set<DayKey>; total: number }>();
  for (const log of logs) {
    const entry = stats.get(log.trackId) ?? { days: new Set<DayKey>(), total: 0 };
    entry.days.add(log.date);
    entry.total += log.amount ?? 0;
    stats.set(log.trackId, entry);
  }

  const order: Record<TrackStatus, number> = { active: 0, paused: 1, archived: 2 };
  return tracks
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((track) => {
      const stat = stats.get(track.id);
      return { ...track, monthDays: stat ? [...stat.days].sort() : [], monthTotal: stat ? stat.total : 0 };
    });
}

export async function createTrack(): Promise<Track> {
  const id = crypto.randomUUID();
  const value: TrackValue = { title: "Untitled track", subtitle: "", icon: "target", unit: "", status: "active" };
  const payload = await encryptRecord(TRACK_KIND, id, value);
  const { data } = await api.post<{ track: { id: string; createdAt: string; updatedAt: string } }>("/tracks", {
    recordId: id,
    payload,
  });
  trackCache.set(id, value);
  return { id, ...value, createdAt: data.track.createdAt, updatedAt: data.track.updatedAt };
}

export async function fetchTrack(id: string): Promise<Track> {
  const { data } = await api.get<{ track: RawTrack }>(`/tracks/${id}`);
  return decodeTrack(data.track);
}

export function updateTrack(id: string, patch: TrackPatch): Promise<Track> {
  // Saves of the same track run one at a time, so two quick edits can't overwrite each other.
  return serialize(`track:${id}`, async () => {
    if (!trackCache.has(id)) await fetchTrack(id);
    const base = trackCache.get(id);
    if (!base) throw new Error("Track could not be loaded");

    const next: TrackValue = {
      title: patch.title !== undefined ? cleanText(patch.title, LIMITS.title, true, "title") : base.title,
      subtitle: patch.subtitle !== undefined ? cleanText(patch.subtitle, LIMITS.subtitle, false, "subtitle") : base.subtitle,
      icon: patch.icon ?? base.icon,
      unit: patch.unit !== undefined ? cleanText(patch.unit, LIMITS.unit, false, "unit") : base.unit,
      status: patch.status ?? base.status,
    };

    const payload = await encryptRecord(TRACK_KIND, id, next);
    const { data } = await api.put<{ track: { id: string; createdAt: string; updatedAt: string } }>(`/tracks/${id}`, {
      payload,
    });
    trackCache.set(id, next);
    return { id, ...next, createdAt: data.track.createdAt, updatedAt: data.track.updatedAt };
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await api.delete(`/tracks/${id}`);
  trackCache.delete(id);
}

// ---- logs ------------------------------------------------------------------------------------

export async function fetchLogs(trackId: string, month: string): Promise<TrackLog[]> {
  const { data } = await api.get<{ logs: RawLog[] }>(`/tracks/${trackId}/logs`, { params: { month } });
  return decodeAll(data.logs, decodeLog);
}

export async function createLog(trackId: string, values: LogValues): Promise<TrackLog> {
  const clean = cleanLog(values);
  const id = crypto.randomUUID();
  const payload = await encryptRecord(LOG_KIND, id, { trackId, ...clean } satisfies LogValue);
  const { data } = await api.post<{ log: RawLog }>(`/tracks/${trackId}/logs`, {
    recordId: id,
    date: clean.date,
    payload,
  });
  return { id, trackId, ...clean, createdAt: data.log.createdAt, updatedAt: data.log.updatedAt };
}

export async function updateLog(trackId: string, logId: string, values: LogValues): Promise<TrackLog> {
  const clean = cleanLog(values);
  const payload = await encryptRecord(LOG_KIND, logId, { trackId, ...clean } satisfies LogValue);
  const { data } = await api.put<{ log: RawLog }>(`/tracks/${trackId}/logs/${logId}`, { date: clean.date, payload });
  return { id: logId, trackId, ...clean, createdAt: data.log.createdAt, updatedAt: data.log.updatedAt };
}

export async function deleteLog(trackId: string, logId: string): Promise<void> {
  await api.delete(`/tracks/${trackId}/logs/${logId}`);
}

export async function fetchLogsForDay(date: DayKey): Promise<DayTrackLog[]> {
  const { data } = await api.get<{ logs: RawLog[]; tracks: RawTrack[] }>("/tracks/logs", { params: { date } });
  const [logs, tracks] = await Promise.all([decodeAll(data.logs, decodeLog), decodeAll(data.tracks, decodeTrack)]);

  const byId = new Map(tracks.map((track) => [track.id, track]));
  return logs.flatMap((log) => {
    const track = byId.get(log.trackId);
    if (!track) return [];
    return [{ ...log, track: { id: track.id, title: track.title, icon: track.icon, unit: track.unit } }];
  });
}