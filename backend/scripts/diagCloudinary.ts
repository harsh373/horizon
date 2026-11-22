import cloudinary from "../config/cloudinary";
import { env } from "../config/env";

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function describe(error: unknown): string {
  const e = error as { http_code?: number; message?: string };
  return `http ${e?.http_code ?? "?"}: ${e?.message ?? String(error)}`.slice(0, 300);
}

async function step(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    const result = await run();
    console.log(`${name}: OK`, JSON.stringify(result).slice(0, 160));
  } catch (error) {
    console.log(`${name}: FAILED`, describe(error));
  }
}

async function main() {
  console.log("cloud name:", env.cloudinaryCloudName);
  console.log("key starts with:", env.cloudinaryApiKey.slice(0, 4), "| key length:", env.cloudinaryApiKey.length);
  console.log("secret length:", env.cloudinaryApiSecret.length);
  console.log("CLOUDINARY_URL set in shell:", Boolean(process.env.CLOUDINARY_URL));

  await step("ping (read)", () => cloudinary.api.ping());
  await step("usage (read)", async () => {
    const usage = await cloudinary.api.usage();
    return { plan: usage.plan, last_updated: usage.last_updated };
  });
  await step("upload via SDK (create)", async () => {
    const result = await cloudinary.uploader.upload(TINY_PNG, { public_id: "horizon/scripttest/diag" });
    await cloudinary.uploader.destroy(result.public_id);
    return { uploaded_and_deleted: result.public_id };
  });
}

main().catch((error: unknown) => {
  console.error("Script failed:", describe(error));
  process.exit(1);
});