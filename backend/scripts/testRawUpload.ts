import { destroyPhotoAssets, signPhotoUpload } from "../utility/photoAssets";

async function main() {
  const userId = "user_scripttest";
  const recordId = crypto.randomUUID();
  const grant = signPhotoUpload(userId, recordId);

  const form = new FormData();
  form.append("file", new Blob([crypto.getRandomValues(new Uint8Array(200))], { type: "application/octet-stream" }));
  form.append("api_key", grant.apiKey);
  form.append("timestamp", String(grant.timestamp));
  form.append("public_id", grant.full.publicId);
  form.append("signature", grant.full.signature);

  const response = await fetch(grant.uploadUrl, { method: "POST", body: form });
  console.log("STATUS:", response.status);
  console.log("BODY:", await response.text());

  if (response.ok) {
    await destroyPhotoAssets(userId, recordId);
    console.log("Cleaned up the test file.");
  }
}

main().catch((error: unknown) => {
  console.error("Script failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});