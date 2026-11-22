import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import type { Mood } from "../api/journal.api";
import {
  buildMonthGrid,
  formatLongDate,
  formatMonthName,
  parseDayKey,
  shiftMonth,
} from "../config/dates";
import type { DayKey } from "../config/dates";

interface MiniCalendarProps {
  selected: DayKey;
  today: DayKey;
  moods?: Record<DayKey, Mood>;
  onSelect: (day: DayKey) => void;
  onViewChange?: (year: number, month: number) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthOf(key: DayKey): { year: number; month: number } {
  const parts = parseDayKey(key);
  if (parts) return { year: parts.year, month: parts.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Local calendar day of a Date, as YYYY-MM-DD (local time, not UTC).
function localDayKey(date: Date): DayKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as DayKey;
}

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-control text-secondary transition-colors duration-150 hover:bg-hover hover:text-text active:bg-selected";

export default function MiniCalendar({
  selected,
  today,
  moods = {},
  onSelect,
  onViewChange,
}: MiniCalendarProps) {
  const [view, setView] = useState(() => monthOf(selected));
  const { isLoaded, user } = useUser();

  // The day this person joined. null until Clerk has loaded (or if it has no date),
  // in which case no day is ever marked as missed.
  const joinedOn = useMemo<DayKey | null>(() => {
    if (!isLoaded || !user?.createdAt) return null;
    return localDayKey(new Date(user.createdAt));
  }, [isLoaded, user?.createdAt]);

  useEffect(() => {
    setView(monthOf(selected));
  }, [selected]);

  useEffect(() => {
    onViewChange?.(view.year, view.month);
  }, [view, onViewChange]);

  const cells = buildMonthGrid(view.year, view.month);

  return (
    <section aria-label="Calendar">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] tracking-tight">
          <span className="font-semibold text-text">{formatMonthName(view.month)}</span>{" "}
          <span className="font-medium text-secondary">{view.year}</span>
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            className={iconButton}
            onClick={() => setView((current) => shiftMonth(current.year, current.month, -1))}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            className={iconButton}
            onClick={() => setView((current) => shiftMonth(current.year, current.month, 1))}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium text-tertiary">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday[0]}</span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          if (!day) return <span key={"blank-" + index} className="h-9" />;

          const parts = parseDayKey(day);
          const isSelected = day === selected;
          const isToday = day === today;
          const isFuture = day > today;
          const isJoinDay = joinedOn !== null && day === joinedOn;
          const isWithinTrackedRange = joinedOn !== null && day >= joinedOn && day < today;
          const isLogged = Boolean(moods[day]);
          const isMissed = isWithinTrackedRange && !isLogged;

          // Full circle behind the number: red = today, solid = logged, yellow = missed.
          const numberStyle = isToday
            ? isSelected
              ? "bg-alert font-semibold text-white ring-2 ring-alert/35 ring-offset-2 ring-offset-sidebar"
              : "bg-alert font-semibold text-white group-hover:opacity-90"
            : isSelected
              ? "bg-text font-semibold text-bg ring-2 ring-text/25 ring-offset-2 ring-offset-sidebar"
              : isLogged
                ? "bg-text font-semibold text-bg group-hover:opacity-90"
                : isMissed
                  ? "bg-yellow-400 font-semibold text-black group-hover:opacity-90"
                  : isFuture
                    ? "font-medium text-tertiary group-hover:bg-hover"
                    : "font-medium text-text group-hover:bg-hover"; // days before the join day land here

          const label = isJoinDay
            ? `${formatLongDate(day)}, the day you started`
            : formatLongDate(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={label}
              title={isJoinDay ? "The day you started" : undefined}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className="group relative flex h-9 items-start justify-center pt-0.5"
            >
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors duration-150 " +
                  numberStyle
                }
              >
                {parts?.day}
              </span>
              {isJoinDay && (
                <Star
                  aria-hidden="true"
                  size={9}
                  strokeWidth={0}
                  className="pointer-events-none absolute right-0.5 top-0 fill-yellow-300 text-yellow-300"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}