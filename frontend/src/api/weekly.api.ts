import { createPlanStore } from "./planStore";
import type { PlanSnapshot } from "./planStore";

export interface WeeklyItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface WeeklyPlan {
  weekStart: string;
  weekEnd: string;
  items: WeeklyItem[];
  createdAt: string;
  updatedAt: string;
}

const store = createPlanStore("weekly", "/weekly");

// weekStart is a Monday, so the week ends six days later. Plain UTC arithmetic keeps it off the local time zone.
function weekEndOf(weekStart: string): string {
  const [year = 1970, month = 1, day = 1] = weekStart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10);
}

function toPlan(weekStart: string, snapshot: PlanSnapshot): WeeklyPlan {
  return {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    items: snapshot.items,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

// null means nothing has been added to this week yet.
export async function fetchWeeklyPlan(weekStart: string): Promise<WeeklyPlan | null> {
  const snapshot = await store.fetchPlan(weekStart);
  return snapshot ? toPlan(weekStart, snapshot) : null;
}

export async function addWeeklyItem(weekStart: string, text: string): Promise<WeeklyPlan> {
  return toPlan(weekStart, await store.addItem(weekStart, text));
}

export async function updateWeeklyItem(
  weekStart: string,
  itemId: string,
  patch: { text?: string; completed?: boolean },
): Promise<WeeklyPlan> {
  return toPlan(weekStart, await store.updateItem(weekStart, itemId, patch));
}

export async function deleteWeeklyItem(weekStart: string, itemId: string): Promise<WeeklyPlan> {
  return toPlan(weekStart, await store.deleteItem(weekStart, itemId));
}

export async function reorderWeeklyItems(weekStart: string, itemIds: string[]): Promise<WeeklyPlan> {
  return toPlan(weekStart, await store.reorderItems(weekStart, itemIds));
}