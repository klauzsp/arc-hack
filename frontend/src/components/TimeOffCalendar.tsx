"use client";

/**
 * Interactive time-off calendar for employees.
 *
 * Plan:
 * - Grid: one or two months with week rows. Each cell = one day.
 * - Day states: working (selectable), company holiday (red), pending request (orange), approved (green), non-working (grey), past (disabled).
 * - Selection: click toggles; mousedown + drag adds range (only working, non-holiday, not-already-requested, >= today).
 * - Month nav: arrows left/right to change visible month(s). Micro-adjust = prev/next month.
 * - Submit: parent gets selected dates (calendar only ever adds valid days to selection). No "you aren't working that day" — we filter at selection time.
 */

import { useCallback, useMemo, useState } from "react";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const last = new Date(Date.UTC(year, month + 1, 0, 12));
  const days: Date[] = [];
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)));
  }
  return days;
}

function getCalendarWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const startDay = first.getUTCDay();
  const daysInMonth = getDaysInMonth(year, month);
  const leadingBlanks = Array.from({ length: startDay }, () => null);
  const allCells: (Date | null)[] = [...leadingBlanks, ...daysInMonth];
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < allCells.length; i += 7) {
    weeks.push(allCells.slice(i, i + 7));
  }
  while (weeks[weeks.length - 1]?.length && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push(null);
  }
  return weeks;
}

export type TimeOffCalendarProps = {
  holidays: string[];
  workingDays: number[];
  requests: { date: string; status: string }[];
  today: string;
  remainingDays: number;
  selectedDates: Set<string>;
  onSelectedDatesChange: (next: Set<string>) => void;
  disabled?: boolean;
};

export function TimeOffCalendar({
  holidays,
  workingDays,
  requests,
  today,
  remainingDays,
  selectedDates,
  onSelectedDatesChange,
  disabled = false,
}: TimeOffCalendarProps) {
  const [viewYear, setViewYear] = useState(() => new Date(`${today}T12:00:00Z`).getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date(`${today}T12:00:00Z`).getUTCMonth());
  const [dragStart, setDragStart] = useState<string | null>(null);

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const requestByDate = useMemo(() => {
    const m = new Map<string, string>();
    requests.forEach((r) => m.set(r.date, r.status));
    return m;
  }, [requests]);

  const isWorkingDay = useCallback(
    (dateKey: string) => {
      const dayOfWeek = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
      return workingDays.includes(dayOfWeek);
    },
    [workingDays],
  );

  const isSelectable = useCallback(
    (dateKey: string) => {
      if (dateKey < today) return false;
      if (holidaySet.has(dateKey)) return false;
      if (!isWorkingDay(dateKey)) return false;
      const status = requestByDate.get(dateKey);
      if (status === "approved" || status === "pending") return false;
      return true;
    },
    [today, holidaySet, isWorkingDay, requestByDate],
  );

  const weeks = useMemo(() => getCalendarWeeks(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggleDate = useCallback(
    (dateKey: string) => {
      if (disabled) return;
      if (!isSelectable(dateKey)) return;
      const next = new Set(selectedDates);
      if (next.has(dateKey)) next.delete(dateKey);
      else {
        if (next.size >= remainingDays) return;
        next.add(dateKey);
      }
      onSelectedDatesChange(next);
    },
    [disabled, isSelectable, selectedDates, remainingDays, onSelectedDatesChange],
  );

  const addDateToSelection = useCallback(
    (dateKey: string) => {
      if (disabled || !isSelectable(dateKey)) return;
      const next = new Set(selectedDates);
      if (next.has(dateKey)) return;
      if (next.size >= remainingDays) return;
      next.add(dateKey);
      onSelectedDatesChange(next);
    },
    [disabled, isSelectable, selectedDates, remainingDays, onSelectedDatesChange],
  );

  const handleMouseDown = useCallback(
    (dateKey: string) => {
      if (disabled) return;
      if (isSelectable(dateKey)) {
        setDragStart(dateKey);
        toggleDate(dateKey);
      }
    },
    [disabled, isSelectable, toggleDate],
  );

  const handleMouseEnter = useCallback(
    (dateKey: string) => {
      if (disabled || dragStart == null) return;
      if (!isSelectable(dateKey)) return;
      const start = new Date(`${dragStart}T12:00:00Z`).getTime();
      const end = new Date(`${dateKey}T12:00:00Z`).getTime();
      const [from, to] = start <= end ? [dragStart, dateKey] : [dateKey, dragStart];
      const next = new Set(selectedDates);
      const fromDate = new Date(`${from}T12:00:00Z`);
      const toDate = new Date(`${to}T12:00:00Z`);
      for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = toDateKey(d);
        if (isSelectable(key) && next.size < remainingDays) next.add(key);
      }
      onSelectedDatesChange(next);
    },
    [disabled, dragStart, isSelectable, selectedDates, remainingDays, onSelectedDatesChange],
  );

  const handleMouseUp = useCallback(() => {
    setDragStart(null);
  }, []);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="select-none">
      <div className="flex items-center justify-between gap-2 pb-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          aria-label="Previous month"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h4 className="text-sm font-semibold text-white">{monthLabel}</h4>
        <button
          type="button"
          onClick={handleNextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          aria-label="Next month"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div
        className="grid grid-cols-7 gap-0.5 text-center"
        onMouseLeave={handleMouseUp}
        onMouseUp={handleMouseUp}
        role="grid"
        aria-label={`Calendar ${monthLabel}`}
      >
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {label}
          </div>
        ))}
        {weeks.flat().map((cell, idx) => {
          if (cell == null) {
            return <div key={`empty-${idx}`} className="aspect-square rounded-lg" />;
          }
          const dateKey = toDateKey(cell);
          const isPast = dateKey < today;
          const isHoliday = holidaySet.has(dateKey);
          const isWork = isWorkingDay(dateKey);
          const status = requestByDate.get(dateKey);
          const isPending = status === "pending";
          const isApproved = status === "approved";
          const isSelected = selectedDates.has(dateKey);
          const selectable = isSelectable(dateKey);

          let bg = "bg-white/[0.06]";
          let textColor = "text-white/50";
          if (isHoliday) {
            bg = "bg-red-500/30";
            textColor = "text-red-200";
          } else if (isApproved) {
            bg = "bg-emerald-500/25";
            textColor = "text-emerald-200";
          } else if (isPending) {
            bg = "bg-amber-500/25";
            textColor = "text-amber-200";
          } else if (!isWork || isPast) {
            bg = "bg-white/[0.04]";
            textColor = "text-white/40";
          } else {
            textColor = "text-white/90";
          }
          if (isSelected) {
            bg = "bg-[#fc72ff]/40";
            textColor = "text-white";
          }

          return (
            <button
              key={dateKey}
              type="button"
              className={`aspect-square min-w-[36px] rounded-lg text-xs font-medium transition-colors ${bg} ${textColor} ${
                selectable && !disabled ? "cursor-pointer hover:opacity-90" : "cursor-default"
              } ${!selectable ? "opacity-80" : ""}`}
              onClick={() => toggleDate(dateKey)}
              onMouseDown={() => handleMouseDown(dateKey)}
              onMouseEnter={() => handleMouseEnter(dateKey)}
              disabled={disabled || !selectable}
              aria-label={`${dateKey}${isHoliday ? ", company holiday" : ""}${isPending ? ", pending request" : ""}${isApproved ? ", approved" : ""}${isSelected ? ", selected" : ""}`}
              aria-selected={isSelected}
            >
              {cell.getUTCDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" /> Company holiday
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/50" /> Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/50" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fc72ff]/50" /> Selected
        </span>
      </div>
    </div>
  );
}
