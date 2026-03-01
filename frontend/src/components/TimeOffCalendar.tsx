"use client";

/**
 * Interactive time-off calendar for employees.
 *
 * - Add selection (green): start on a non-requested working day; marks days to request.
 * - Remove selection (red): start on a day that already has a request; marks days to cancel.
 *   Days in toRemove that have no request are still shown as selected (red) but ignored on submit.
 * - Transparent light green = to add; transparent light red = to remove.
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
  selectedToAdd: Set<string>;
  selectedToRemove: Set<string>;
  onSelectedToAddChange: (next: Set<string>) => void;
  onSelectedToRemoveChange: (next: Set<string>) => void;
  disabled?: boolean;
};

export function TimeOffCalendar({
  holidays,
  workingDays,
  requests,
  today,
  remainingDays,
  selectedToAdd,
  selectedToRemove,
  onSelectedToAddChange,
  onSelectedToRemoveChange,
  disabled = false,
}: TimeOffCalendarProps) {
  const [viewYear, setViewYear] = useState(() => new Date(`${today}T12:00:00Z`).getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date(`${today}T12:00:00Z`).getUTCMonth());
  const [dragState, setDragState] = useState<{ mode: "add" | "remove"; start: string } | null>(null);

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

  const isSelectableToAdd = useCallback(
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

  const hasRequest = useCallback(
    (dateKey: string) => {
      const status = requestByDate.get(dateKey);
      return status === "pending" || status === "approved";
    },
    [requestByDate],
  );

  const weeks = useMemo(() => getCalendarWeeks(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggleAdd = useCallback(
    (dateKey: string) => {
      if (disabled || !isSelectableToAdd(dateKey)) return;
      const next = new Set(selectedToAdd);
      const removeNext = new Set(selectedToRemove);
      removeNext.delete(dateKey);
      if (next.has(dateKey)) next.delete(dateKey);
      else {
        if (next.size >= remainingDays) return;
        next.add(dateKey);
      }
      onSelectedToAddChange(next);
      onSelectedToRemoveChange(removeNext);
    },
    [disabled, isSelectableToAdd, selectedToAdd, selectedToRemove, remainingDays, onSelectedToAddChange, onSelectedToRemoveChange],
  );

  const toggleRemove = useCallback(
    (dateKey: string) => {
      if (disabled) return;
      if (!hasRequest(dateKey)) return;
      const next = new Set(selectedToRemove);
      const addNext = new Set(selectedToAdd);
      addNext.delete(dateKey);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      onSelectedToRemoveChange(next);
      onSelectedToAddChange(addNext);
    },
    [disabled, hasRequest, selectedToRemove, selectedToAdd, onSelectedToRemoveChange, onSelectedToAddChange],
  );

  const handleMouseDown = useCallback(
    (dateKey: string) => {
      if (disabled) return;
      if (isSelectableToAdd(dateKey)) {
        setDragState({ mode: "add", start: dateKey });
        toggleAdd(dateKey);
      } else if (hasRequest(dateKey)) {
        setDragState({ mode: "remove", start: dateKey });
        toggleRemove(dateKey);
      }
    },
    [disabled, isSelectableToAdd, hasRequest, toggleAdd, toggleRemove],
  );

  const handleMouseEnter = useCallback(
    (dateKey: string) => {
      if (disabled || dragState == null) return;
      if (dragState.mode === "add") {
        if (!isSelectableToAdd(dateKey)) return;
        const start = new Date(`${dragState.start}T12:00:00Z`).getTime();
        const end = new Date(`${dateKey}T12:00:00Z`).getTime();
        const [from, to] = start <= end ? [dragState.start, dateKey] : [dateKey, dragState.start];
        const next = new Set(selectedToAdd);
        const fromDate = new Date(`${from}T12:00:00Z`);
        const toDate = new Date(`${to}T12:00:00Z`);
        for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
          const key = toDateKey(d);
          if (isSelectableToAdd(key) && next.size < remainingDays) next.add(key);
        }
        onSelectedToAddChange(next);
      } else {
        const start = new Date(`${dragState.start}T12:00:00Z`).getTime();
        const end = new Date(`${dateKey}T12:00:00Z`).getTime();
        const [from, to] = start <= end ? [dragState.start, dateKey] : [dateKey, dragState.start];
        const next = new Set(selectedToRemove);
        const fromDate = new Date(`${from}T12:00:00Z`);
        const toDate = new Date(`${to}T12:00:00Z`);
        for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
          next.add(toDateKey(d));
        }
        onSelectedToRemoveChange(next);
      }
    },
    [
      disabled,
      dragState,
      isSelectableToAdd,
      selectedToAdd,
      selectedToRemove,
      remainingDays,
      onSelectedToAddChange,
      onSelectedToRemoveChange,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleClick = useCallback(
    (dateKey: string) => {
      if (disabled) return;
      if (isSelectableToAdd(dateKey)) toggleAdd(dateKey);
      else if (hasRequest(dateKey)) toggleRemove(dateKey);
    },
    [disabled, isSelectableToAdd, hasRequest, toggleAdd, toggleRemove],
  );

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
          const inToAdd = selectedToAdd.has(dateKey);
          const inToRemove = selectedToRemove.has(dateKey);
          const selectableAdd = isSelectableToAdd(dateKey);
          const canRemove = hasRequest(dateKey);

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

          const clickable = (selectableAdd || canRemove) && !disabled;

          return (
            <button
              key={dateKey}
              type="button"
              className={`relative aspect-square min-w-[36px] rounded-lg text-xs font-medium transition-colors ${bg} ${textColor} ${
                clickable ? "cursor-pointer hover:opacity-90" : "cursor-default"
              } ${!clickable && !isHoliday ? "opacity-80" : ""}`}
              onClick={() => handleClick(dateKey)}
              onMouseDown={() => handleMouseDown(dateKey)}
              onMouseEnter={() => handleMouseEnter(dateKey)}
              disabled={disabled}
              aria-label={`${dateKey}${isHoliday ? ", company holiday" : ""}${isPending ? ", pending request" : ""}${isApproved ? ", approved" : ""}${inToAdd ? ", add" : ""}${inToRemove ? ", remove" : ""}`}
              aria-selected={inToAdd || inToRemove}
            >
              {inToAdd && (
                <span className="absolute inset-0 rounded-lg bg-emerald-400/25 ring-1 ring-inset ring-emerald-400/40" aria-hidden />
              )}
              {inToRemove && (
                <span className="absolute inset-0 rounded-lg bg-red-400/25 ring-1 ring-inset ring-red-400/40" aria-hidden />
              )}
              <span className="relative z-10">{cell.getUTCDate()}</span>
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
          <span className="rounded bg-emerald-400/30 px-1.5 py-0.5">Green</span> Add request
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-red-400/30 px-1.5 py-0.5">Red</span> Cancel request
        </span>
      </div>
    </div>
  );
}
