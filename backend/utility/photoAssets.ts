import { getAuth } from "@clerk/express";
import type { Request } from "express";
import cloudinary from "../config/cloudinary";
import { env } from "../config/env";
import type { SealedPhoto } from "../models/JournalEntry";
import { plainPayload } from "./payload";
import type { StoredPayload } from "./payload";

export type PhotoVariant = "full" | "thumb";

export interface SealedPhotoView {
  recordId: string;
  payload: StoredPayload;
  thumbUrl: string;
  fullUrl: string;
}

export function requestUserId(req: Request): string {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("No signed-in user on this request");
  return userId;
}

// The server never stores Cloudinary ids. It derives them, so they can't point outside the user's own folder.
export function photoPublicId(userId: string, recordId: string, variant: PhotoVariant): string {
  return `horizon/${userId}/${variant === "thumb" ? `${recordId}-thumb` : recordId}`;
}

export function photoUrl(userId: string, recordId: string, variant: PhotoVariant): string {
  return `https://res.cloudinary.com/${env.cloudinaryCloudName}/raw/upload/${photoPublicId(userId, recordId, variant)}`;
}

export function sealedPhotosOf(userId: string, photos: readonly SealedPhoto[] | undefined): SealedPhotoView[] {
  return (photos ?? []).map((photo) => ({
    recordId: photo.recordId,
    payload: plainPayload(photo.payload),
    thumbUrl: photoUrl(userId, photo.recordId, "thumb"),
    fullUrl: photoUrl(userId, photo.recordId, "full"),
  }));
}

// Lets the browser upload the two ciphertext files straight to Cloudinary. Each signature is only
// valid for one exact public id, and that id always contains the caller's own user id.
export function signPhotoUpload(userId: string, recordId: string) {
  const timestamp = Math.round(Date.now() / 1000);

  const grant = (variant: PhotoVariant) => {
    const publicId = photoPublicId(userId, recordId, variant);
    const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, env.cloudinaryApiSecret);
    return { publicId, signature };
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/raw/upload`,
    apiKey: env.cloudinaryApiKey,
    timestamp,
    full: grant("full"),
    thumb: grant("thumb"),
  };
}

// Best effort: an orphaned ciphertext file is harmless, a stuck "can't delete" screen is not.
export async function destroyPhotoAssets(userId: string, recordId: string): Promise<void> {
  const variants: PhotoVariant[] = ["full", "thumb"];
  await Promise.allSettled(
    variants.map((variant) =>
      cloudinary.uploader.destroy(photoPublicId(userId, recordId, variant), { resource_type: "raw", invalidate: true }),
    ),
  );
}