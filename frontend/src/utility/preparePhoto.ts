const FULL_MAX = 2000;
const THUMB_MAX = 640;
const FULL_QUALITY = 0.85;
const THUMB_QUALITY = 0.78;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export class PhotoError extends Error {}

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

async function render(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("This browser can't process images.");

  // JPEG has no transparency, so a transparent PNG would turn black without this.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new PhotoError("Couldn't process that image.");
  return { blob, width, height };
}

// Always re-encodes to JPEG. That drops EXIF (GPS position, camera, timestamps) and every other
// hidden tag, which the old compressImage.ts left in place for small files.
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) throw new PhotoError("That file isn't an image.");
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError("That photo is too large. The limit is 30 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError("This browser can't read that image format (HEIC isn't supported here). Try a JPEG or PNG.");
  }

  try {
    const full = await render(bitmap, FULL_MAX, FULL_QUALITY);
    const thumb = await render(bitmap, THUMB_MAX, THUMB_QUALITY);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}