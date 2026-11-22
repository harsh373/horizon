import axios from "axios";
import { decryptBlob, onVaultCleared } from "./vaultSession";

export type ImageKind = "photo-thumb" | "photo-full";

// Decrypted photos live in memory as object URLs. Anything still on screen is kept; anything
// off screen is kept for quick re-use until more than MAX_IDLE of them pile up, then the oldest go.
const MAX_IDLE = 40;

interface Entry {
  promise: Promise<string>;
  refs: number;
  objectUrl: string | null;
}

const entries = new Map<string, Entry>();

onVaultCleared(() => {
  for (const entry of entries.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  entries.clear();
});

async function load(kind: ImageKind, recordId: string, url: string): Promise<string> {
  // Plain axios on purpose: the app's own client would attach your login token to a request for Cloudinary.
  const { data } = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
  const bytes = await decryptBlob(kind, recordId, new Uint8Array(data));
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

function trimIdle(): void {
  const idle = [...entries].filter(([, entry]) => entry.refs === 0 && entry.objectUrl !== null);
  for (const [key, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    entries.delete(key);
  }
}

export function acquireImage(
  kind: ImageKind,
  recordId: string,
  url: string,
): { promise: Promise<string>; release: () => void } {
  const key = `${kind}:${recordId}`;
  let entry = entries.get(key);

  if (!entry) {
    const created: Entry = { promise: Promise.resolve(""), refs: 0, objectUrl: null };
    created.promise = load(kind, recordId, url).then((objectUrl) => {
      // The vault was cleared (sign-out) while this was downloading.
      if (entries.get(key) !== created) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Vault was cleared");
      }
      created.objectUrl = objectUrl;
      return objectUrl;
    });
    // A failed load is forgotten, so the next attempt tries again.
    void created.promise.catch(() => {
      if (entries.get(key) === created) entries.delete(key);
    });
    entries.set(key, created);
    entry = created;
  }

  entry.refs += 1;
  const held = entry;
  let released = false;

  return {
    promise: held.promise,
    release() {
      if (released) return;
      released = true;
      held.refs -= 1;
      if (held.refs === 0) trimIdle();
    },
  };
}