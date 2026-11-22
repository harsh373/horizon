import cloudinary from "../config/cloudinary";
import { env } from "../config/env";

// 1x1 transparent PNG, just so the "image" test has something valid to upload.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function tryUpload(resourceType: "raw" | "image", bytes: Buffer): Promise<void> {
  const publicId = `horizon/scripttest/${resourceType}-${Date.now()}`;
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, env.cloudinaryApiSecret);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]));
  form.append("api_key", env.cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("signature", signature);

  const url = `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/${resourceType}/upload`;
  const response = await fetch(url, { method: "POST", body: form });
  console.log(`--- ${resourceType.toUpperCase()} ---`);
  console.log("STATUS:", response.status);
  console.log("BODY:", (await response.text()).slice(0, 300));

  if (response.ok) {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log("(test file deleted)");
  }
}

async function main() {
  await tryUpload("raw", Buffer.from(crypto.getRandomValues(new Uint8Array(200))));
  await tryUpload("image", TINY_PNG);
}

main().catch((error: unknown) => {
  console.error("Script failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});