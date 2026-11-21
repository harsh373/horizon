import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord, onVaultCleared } from "../crypto/vaultSession";
import { api } from "./api";
import { serialize } from "./queue";

const MAX_ITEMS = 200;
const TEXT_LIMIT = 500;

export interface PlanItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface PlanSnapshot {
  items: PlanItem[];
  createdAt: string;
  updatedAt: string;
}

interface PlanValue {
  items: PlanItem[];
}

interface RawPlan {
  payload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

function cleanText(value: string): string {
  const text = value.trim();
  if (!text) throw new Error("text is required");
  if (text.length > TEXT_LIMIT) throw new Error("text is too long");
  return text;
}

// A plan (Today or Weekly) is one encrypted document per day or week. Every change reads the plan,
// changes it, encrypts it and saves the whole thing. Changes to the same plan run one at a time.
export function createPlanStore(kind: string, path: string) {
  const cache = new Map<string, PlanSnapshot>();
  onVaultCleared(() => cache.clear());

  async function fetchPlan(key: string): Promise<PlanSnapshot | null> {
    const { data } = await api.get<{ plan: RawPlan | null }>(`${path}/${key}`);
    if (!data.plan) {
      cache.delete(key);
      return null;
    }
    // If this fails to decrypt it throws, so the screen shows an error and a blank plan never overwrites the real one.
    const value = await decryptRecord<PlanValue>(kind, key, data.plan.payload);
    const snapshot: PlanSnapshot = {
      items: Array.isArray(value.items) ? value.items : [],
      createdAt: data.plan.createdAt,
      updatedAt: data.plan.updatedAt,
    };
    cache.set(key, snapshot);
    return snapshot;
  }

  async function currentItems(key: string): Promise<PlanItem[]> {
    const cached = cache.get(key);
    if (cached) return cached.items;
    return (await fetchPlan(key))?.items ?? [];
  }

  async function writePlan(key: string, items: PlanItem[]): Promise<PlanSnapshot> {
    const payload = await encryptRecord(kind, key, { items } satisfies PlanValue);
    const { data } = await api.put<{ plan: RawPlan }>(`${path}/${key}`, { payload });
    const snapshot: PlanSnapshot = { items, createdAt: data.plan.createdAt, updatedAt: data.plan.updatedAt };
    cache.set(key, snapshot);
    return snapshot;
  }

  function change(key: string, edit: (items: PlanItem[]) => PlanItem[]): Promise<PlanSnapshot> {
    return serialize(`${kind}:${key}`, async () => {
      const items = await currentItems(key);
      return writePlan(key, edit(items));
    });
  }

  return {
    fetchPlan,
    addItem(key: string, text: string): Promise<PlanSnapshot> {
      const clean = cleanText(text);
      return change(key, (items) => {
        if (items.length >= MAX_ITEMS) throw new Error("This plan is full");
        return [...items, { id: crypto.randomUUID(), text: clean, completed: false }];
      });
    },
    updateItem(key: string, itemId: string, patch: { text?: string; completed?: boolean }): Promise<PlanSnapshot> {
      const text = patch.text !== undefined ? cleanText(patch.text) : undefined;
      return change(key, (items) => {
        if (!items.some((item) => item.id === itemId)) throw new Error("No such item");
        return items.map((item) =>
          item.id === itemId
            ? { ...item, text: text ?? item.text, completed: patch.completed ?? item.completed }
            : item,
        );
      });
    },
    deleteItem(key: string, itemId: string): Promise<PlanSnapshot> {
      return change(key, (items) => items.filter((item) => item.id !== itemId));
    },
    reorderItems(key: string, itemIds: string[]): Promise<PlanSnapshot> {
      return change(key, (items) => {
        const byId = new Map(items.map((item) => [item.id, item]));
        const sameSet = items.length === itemIds.length && itemIds.every((id) => byId.has(id));
        if (!sameSet) throw new Error("itemIds must match the current items exactly");
        return itemIds.flatMap((id) => {
          const item = byId.get(id);
          return item ? [item] : [];
        });
      });
    },
  };
}