import cloudinary from "../config/cloudinary";

// Old journal photos lived in folders named after the day, like harshs-journal/2026-09-23.
// The prefix stops at the year digits on purpose, so it can't touch any other folder under harshs-journal/.
const PREFIX = "harshs-journal/20";
const BATCH = 100;
const reallyDelete = process.argv.includes("--delete");

async function listAll(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursor,
    });
    ids.push(...(result.resources as { public_id: string }[]).map((item) => item.public_id));
    cursor = result.next_cursor as string | undefined;
  } while (cursor);
  return ids;
}

async function main() {
  const ids = await listAll();
  const folders = new Set(ids.map((id) => id.split("/").slice(0, 2).join("/")));

  console.log(`Found ${ids.length} old photos in ${folders.size} folders under ${PREFIX}*`);
  console.log("Sample folders:", [...folders].slice(0, 8));

  if (!reallyDelete) {
    console.log("Dry run only. Nothing was deleted. Run again with --delete to remove them.");
    return;
  }

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const result = await cloudinary.api.delete_resources(batch, { resource_type: "image" });
    console.log(`Deleted batch ${i / BATCH + 1}:`, Object.keys(result.deleted ?? {}).length, "assets");
  }
  console.log("Done.");
}

main().catch((error: unknown) => {
  console.error("Cleanup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});