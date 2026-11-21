import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord } from "../crypto/vaultSession";
import { api } from "./api";

const TITLE_KIND = "thought-title";
const BODY_KIND = "thought-body";

export interface ThoughtSummary {
  id: string;
  title: string;
}

export interface Thought {
  id: string;
  title: string;
  body: string;
}

interface TitleValue {
  title: string;
  hasBody: boolean;
}

interface BodyValue {
  body: string;
}

// The title payload also records whether a body exists, so a save that changes only the title or only
// the body still writes a correct title payload. This remembers the last known state of each thought
// that was loaded, created or saved in this tab.
const known = new Map<string, TitleValue>();

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function fetchThoughts(): Promise<ThoughtSummary[]> {
  const { data } = await api.get<{ thoughts: { id: string; titlePayload: EncryptedPayload }[] }>("/thoughts");

  const decoded = await Promise.all(
    data.thoughts.map(async (item) => {
      try {
        const value = await decryptRecord<TitleValue>(TITLE_KIND, item.id, item.titlePayload);
        known.set(item.id, { title: value.title, hasBody: value.hasBody });
        return { id: item.id, title: value.title, hasBody: value.hasBody };
      } catch {
        // One damaged record must not hide the rest of the sky.
        return { id: item.id, title: "(couldn't be decrypted)", hasBody: true };
      }
    }),
  );

  // The server can't see inside, so abandoned empty drafts are hidden here.
  return decoded.filter((item) => item.title !== "" || item.hasBody).map(({ id, title }) => ({ id, title }));
}

export async function createThought(): Promise<Thought> {
  const id = crypto.randomUUID();
  const [titlePayload, bodyPayload] = await Promise.all([
    encryptRecord(TITLE_KIND, id, { title: "", hasBody: false } satisfies TitleValue),
    encryptRecord(BODY_KIND, id, { body: "" } satisfies BodyValue),
  ]);
  await api.post("/thoughts", { recordId: id, titlePayload, bodyPayload });
  known.set(id, { title: "", hasBody: false });
  return { id, title: "", body: "" };
}

export async function fetchThought(id: string): Promise<Thought> {
  const { data } = await api.get<{
    thought: { id: string; titlePayload: EncryptedPayload; bodyPayload: EncryptedPayload };
  }>(`/thoughts/${id}`);

  const [title, body] = await Promise.all([
    decryptRecord<TitleValue>(TITLE_KIND, id, data.thought.titlePayload),
    decryptRecord<BodyValue>(BODY_KIND, id, data.thought.bodyPayload),
  ]);

  known.set(id, { title: title.title, hasBody: body.body.length > 0 });
  return { id, title: title.title, body: body.body };
}

export async function saveThought(id: string, patch: { title?: string; body?: string }): Promise<void> {
  const prior = known.get(id);
  if (!prior) throw new Error("Thought was not loaded before saving");

  const title = patch.title !== undefined ? normalizeTitle(patch.title) : prior.title;
  const hasBody = patch.body !== undefined ? patch.body.length > 0 : prior.hasBody;

  const request: { titlePayload: EncryptedPayload; bodyPayload?: EncryptedPayload } = {
    titlePayload: await encryptRecord(TITLE_KIND, id, { title, hasBody } satisfies TitleValue),
  };
  // The big body is only re-encrypted and re-sent when it actually changed.
  if (patch.body !== undefined) {
    request.bodyPayload = await encryptRecord(BODY_KIND, id, { body: patch.body } satisfies BodyValue);
  }

  await api.patch(`/thoughts/${id}`, request);
  known.set(id, { title, hasBody });
}

export async function reorderThoughts(ids: string[]): Promise<void> {
  await api.put("/thoughts/order", { ids });
}

export async function deleteThought(id: string): Promise<void> {
  await api.delete(`/thoughts/${id}`);
  known.delete(id);
}