import axios from "axios";
import type { DayKey } from "../config/dates";
import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptBlob, encryptRecord } from "../crypto/vaultSession";
import { preparePhoto } from "../utility/preparePhoto";
import { api } from "./api";

export const PHOTO_META_KIND = "photo-meta";
export const PHOTO_FULL_KIND = "photo-full";
export const PHOTO_THUMB_KIND = "photo-thumb";

export interface JournalPhoto {
  id: string; // the photo's record id (UUID)
  caption: string;
  width: number;
  height: number;
  thumbUrl: string;
  fullUrl: string;
}

// What the server stores and returns: encrypted metadata plus the two Cloudinary addresses.
export interface RawPhoto {
  recordId: string;
  payload: EncryptedPayload;
  thumbUrl: string;
  fullUrl: string;
}

interface PhotoMeta {
  date: string;
  caption: string;
  width: number;
  height: number;
  mime: string;
}

interface UploadGrant {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  full: { publicId: string; signature: string };
  thumb: { publicId: string; signature: string };
}

// A photo that can't be decrypted, or whose decrypted day doesn't match the day it sits on, is skipped.
// Photos are separate records, so skipping one can never overwrite anything.
export async function decodePhoto(date: DayKey, raw: RawPhoto): Promise<JournalPhoto | null> {
  try {
    const meta = await decryptRecord<PhotoMeta>(PHOTO_META_KIND, raw.recordId, raw.payload);
    if (meta.date !== date) return null;
    if (typeof meta.width !== "number" || typeof meta.height !== "number") return null;
    return {
      id: raw.recordId,
      caption: typeof meta.caption === "string" ? meta.caption : "",
      width: meta.width,
      height: meta.height,
      thumbUrl: raw.thumbUrl,
      fullUrl: raw.fullUrl,
    };
  } catch {
    return null;
  }
}

export async function decodePhotos(date: DayKey, raws: RawPhoto[] | undefined): Promise<JournalPhoto[]> {
  const decoded = await Promise.all((raws ?? []).map((raw) => decodePhoto(date, raw)));
  return decoded.filter((photo): photo is JournalPhoto => photo !== null);
}

async function toBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function sendToCloudinary(
  grant: UploadGrant,
  target: { publicId: string; signature: string },
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/octet-stream" }));
  form.append("api_key", grant.apiKey);
  form.append("timestamp", String(grant.timestamp));
  form.append("public_id", target.publicId);
  form.append("signature", target.signature);
  // Plain axios, not the app client: Cloudinary must never receive the login token.
  await axios.post(grant.uploadUrl, form);
}

export async function uploadJournalPhoto(date: DayKey, file: File): Promise<JournalPhoto> {
  const prepared = await preparePhoto(file);
  const id = crypto.randomUUID();
  const caption = "";

  const [fullBytes, thumbBytes] = await Promise.all([toBytes(prepared.full), toBytes(prepared.thumb)]);
  const [fullSealed, thumbSealed, payload] = await Promise.all([
    encryptBlob(PHOTO_FULL_KIND, id, fullBytes),
    encryptBlob(PHOTO_THUMB_KIND, id, thumbBytes),
    encryptRecord(PHOTO_META_KIND, id, {
      date,
      caption,
      width: prepared.width,
      height: prepared.height,
      mime: "image/jpeg",
    } satisfies PhotoMeta),
  ]);

  const { data: grant } = await api.post<UploadGrant>(`/journal/${date}/photos/sign`, { recordId: id });

  try {
    await Promise.all([
      sendToCloudinary(grant, grant.full, fullSealed),
      sendToCloudinary(grant, grant.thumb, thumbSealed),
    ]);
    const { data } = await api.post<{ photo: RawPhoto }>(`/journal/${date}/photos`, { recordId: id, payload });
    return {
      id,
      caption,
      width: prepared.width,
      height: prepared.height,
      thumbUrl: data.photo.thumbUrl,
      fullUrl: data.photo.fullUrl,
    };
  } catch (error) {
    // Don't leave half an upload behind on Cloudinary.
    await api.delete(`/journal/${date}/photos/${id}`).catch(() => undefined);
    throw error;
  }
}

export async function deleteJournalPhoto(date: DayKey, photoId: string): Promise<void> {
  await api.delete(`/journal/${date}/photos/${photoId}`);
}