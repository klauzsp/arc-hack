import {
  WORKING_DAYS_IN_YEAR,
  addClockHours,
  addDays,
  currentSemimonthlyPeriod,
  hoursBetween,
  parseIsoDate,
  yearStart,
} from "../lib/dates";
import type {
  EmployeeRecord,
  HolidayRecord,
  PayRunItemPreview,
  PayRunItemRecord,
  PayRunRecord,
  RecipientMetrics,
  ScheduleRecord,
  TimeEntryRecord,
} from "./types";

const HOURLY_SHIFT_PATTERNS = [
  [
    { clockIn: "08:30", clockOut: "12:15" },
    { clockIn: "13:00", clockOut: "17:30" },
  ],
  [
    { clockIn: "08:45", clockOut: "12:00" },
    { clockIn: "13:00", clockOut: "17:15" },
  ],
  [
    { clockIn: "09:00", clockOut: "12:00" },
    { clockIn: "13:15", clockOut: "17:00" },
  ],
] as const;

function roundCents(value: number) {
  return Math.round(value);
}

export function dollarsFromCents(value: number) {
  return Number((value / 100).toFixed(2));
}

export function centsFromDollars(value: number) {
  return Math.round(value * 100);
}

export function chainIdFromPreference(chainPreference: string | null | undefined, arcChainId: number) {
  if (chainPreference === "Base") return 8453;
  if (chainPreference === "Arbitrum") return 42161;
  if (chainPreference === "Ethereum") return 11155111;
  return arcChainId;
}

export function getSchedule(scheduleId: string | null, schedules: ScheduleRecord[]) {
  return schedules.find((schedule) => schedule.id === scheduleId) ?? schedules[0];
}

function countHolidays(start: string, end: string, holidaySet: Set<string>) {
  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if (holidaySet.has(cursor)) total += 1;
  }
  return total;
}

function countScheduledDays(schedule: ScheduleRecord, start: string, end: string, holidaySet: Set<string>) {
  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dayOfWeek = parseIsoDate(cursor).getUTCDay();
    if (schedule.workingDays.includes(dayOfWeek) && !holidaySet.has(cursor)) {
      total += 1;
    }
  }
  return total;
}

export function buildHourlyEntries(
  employeeId: string,
  schedule: ScheduleRecord,
  start: string,
  end: string,
  holidays: HolidayRecord[],
  offset: number,
) {
  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const entries: Omit<TimeEntryRecord, "createdAt">[] = [];
  let dayIndex = 0;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dayOfWeek = parseIsoDate(cursor).getUTCDay();
    if (!schedule.workingDays.includes(dayOfWeek) || holidaySet.has(cursor)) continue;

    const pattern = HOURLY_SHIFT_PATTERNS[(dayIndex + offset) % HOURLY_SHIFT_PATTERNS.length];
    entries.push(
      {
        id: `${employeeId}-${cursor}-1`,
        employeeId,
        date: cursor,
        clockIn: pattern[0].clockIn,
        clockOut: pattern[0].clockOut,
      },
      {
        id: `${employeeId}-${cursor}-2`,
        employeeId,
        date: cursor,
        clockIn: pattern[1].clockIn,
        clockOut: pattern[1].clockOut,
      },
    );
    dayIndex += 1;
  }

  return entries;
}

function periodStats(
  employee: EmployeeRecord,
  start: string,
  end: string,
  schedules: ScheduleRecord[],
  holidays: HolidayRecord[],
  timeEntries: TimeEntryRecord[],
  mode: "actual" | "forecast",
) {
  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const schedule = getSchedule(employee.scheduleId, schedules);
  const scheduledDays = countScheduledDays(schedule, start, end, holidaySet);
  const scheduledHours = scheduledDays * schedule.hoursPerDay;
  const relevantEntries = timeEntries.filter(
    (entry) =>
      entry.employeeId === employee.id &&
      entry.date >= start &&
      entry.date <= end &&
      entry.clockOut,
  );
  const actualHours = relevantEntries.reduce(
    (total, entry) => total + hoursBetween(entry.clockIn, entry.clockOut!),
    0,
  );
  const actualDays = new Set(relevantEntries.map((entry) => entry.date)).size;
  const useForecast = mode === "forecast";

  const hoursWorked = useForecast
    ? actualHours || scheduledHours
    : employee.timeTrackingMode === "check_in_out"
      ? actualHours
      : scheduledHours;
  const daysWorked = useForecast
    ? actualDays || scheduledDays
    : employee.timeTrackingMode === "check_in_out"
      ? actualDays
      : scheduledDays;

  return {
    daysWorked,
    hoursWorked,
    holidayCount: countHolidays(start, end, holidaySet),
    scheduleHoursPerDay: schedule.hoursPerDay,
  };
}

function earningsForStats(
  employee: EmployeeRecord,
  stats: { daysWorked: number; hoursWorked: number },
) {
  if (employee.payType === "hourly") return roundCents(employee.rateCents * stats.hoursWorked);
  if (employee.payType === "daily") return roundCents(employee.rateCents * stats.daysWorked);
  return roundCents((employee.rateCents / WORKING_DAYS_IN_YEAR) * stats.daysWorked);
}

export function calculateRecipientMetrics(
  employee: EmployeeRecord,
  payRuns: PayRunRecord[],
  payRunItems: PayRunItemRecord[],
  schedules: ScheduleRecord[],
  holidays: HolidayRecord[],
  timeEntries: TimeEntryRecord[],
  today: string,
): RecipientMetrics {
  const { periodStart, periodEnd } = currentSemimonthlyPeriod(today);
  const currentStats = periodStats(employee, periodStart, periodEnd, schedules, holidays, timeEntries, "actual");
  const ytdStats = periodStats(employee, yearStart(today), today, schedules, holidays, timeEntries, "actual");
  const totalPaidCents = payRuns
    .filter((payRun) => payRun.status === "executed")
    .flatMap((payRun) => payRunItems.filter((item) => item.payRunId === payRun.id))
    .filter((item) => item.employeeId === employee.id)
    .reduce((total, item) => total + item.amountCents, 0);

  const currentPeriodEarnedCents = earningsForStats(employee, currentStats);
  const ytdEarnedCents = earningsForStats(employee, ytdStats);

  return {
    currentPeriodEarnedCents,
    ytdEarnedCents,
    totalPaidCents,
    availableToWithdrawCents: Math.max(ytdEarnedCents - totalPaidCents, 0),
    currentPeriodHours: Number(currentStats.hoursWorked.toFixed(1)),
    ytdHours: Number(ytdStats.hoursWorked.toFixed(1)),
    currentPeriodDays: currentStats.daysWorked,
    ytdDays: ytdStats.daysWorked,
    currentPeriodHolidayCount: currentStats.holidayCount,
    ytdHolidayCount: ytdStats.holidayCount,
    scheduleHoursPerDay: currentStats.scheduleHoursPerDay,
  };
}

export function buildPayRunItemsPreview(
  employees: EmployeeRecord[],
  schedules: ScheduleRecord[],
  holidays: HolidayRecord[],
  timeEntries: TimeEntryRecord[],
  periodStart: string,
  periodEnd: string,
  today: string,
  arcChainId: number,
): PayRunItemPreview[] {
  const isForecast = periodStart > today;
  return employees.map((employee) => {
    const stats = periodStats(
      employee,
      periodStart,
      periodEnd,
      schedules,
      holidays,
      timeEntries,
      isForecast ? "forecast" : "actual",
    );
    const amountCents = earningsForStats(employee, stats);
    return {
      employeeId: employee.id,
      recipientWalletAddress: employee.destinationWalletAddress ?? employee.walletAddress,
      destinationChainId: employee.destinationChainId ?? chainIdFromPreference(employee.chainPreference, arcChainId),
      amountCents,
      status: periodEnd <= today ? "ready" : "forecast",
    };
  });
}

export function suggestClockInTime(employeeId: string, today: string, timeEntries: TimeEntryRecord[]) {
  const todaysEntries = timeEntries.filter((entry) => entry.employeeId === employeeId && entry.date === today);
  if (todaysEntries.length === 0) return "09:00";
  if (todaysEntries.length === 1) return "13:15";
  return addClockHours(todaysEntries[todaysEntries.length - 1].clockOut ?? "17:00", 0.5);
}

export function suggestClockOutTime(employeeId: string, today: string, timeEntries: TimeEntryRecord[], clockIn: string) {
  const todaysEntries = timeEntries.filter((entry) => entry.employeeId === employeeId && entry.date === today);
  if (todaysEntries.length === 0) return "12:30";
  if (todaysEntries.length === 1) return "17:15";
  return addClockHours(clockIn, 3.5);
}
