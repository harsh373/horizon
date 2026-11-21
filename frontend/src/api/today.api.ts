import { createPlanStore } from "./planStore";
import type { PlanSnapshot } from "./planStore";

export interface TodayItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TodayPlan {
  date: string;
  items: TodayItem[];
  createdAt: string;
  updatedAt: string;
}

const store = createPlanStore("today", "/today");

function toPlan(date: string, snapshot: PlanSnapshot): TodayPlan {
  return { date, items: snapshot.items, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt };
}

// null means nothing has been added to today yet.
export async function fetchTodayPlan(date: string): Promise<TodayPlan | null> {
  const snapshot = await store.fetchPlan(date);
  return snapshot ? toPlan(date, snapshot) : null;
}

export async function addTodayItem(date: string, text: string): Promise<TodayPlan> {
  return toPlan(date, await store.addItem(date, text));
}

export async function updateTodayItem(
  date: string,
  itemId: string,
  patch: { text?: string; completed?: boolean },
): Promise<TodayPlan> {
  return toPlan(date, await store.updateItem(date, itemId, patch));
}

export async function deleteTodayItem(date: string, itemId: string): Promise<TodayPlan> {
  return toPlan(date, await store.deleteItem(date, itemId));
}