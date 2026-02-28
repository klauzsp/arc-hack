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
  WithdrawalRecord,
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

function maxIsoDate(left: string, right: string) {
  return left > right ? left : right;
}

function overlaps(start: string, end: string, otherStart: string, otherEnd: string) {
  return start <= otherEnd && otherStart <= end;
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

function sumActualHoursByDate(employeeId: string, start: string, end: string, timeEntries: TimeEntryRecord[]) {
  const totals = new Map<string, number>();
  for (const entry of timeEntries) {
    if (entry.employeeId !== employeeId || !entry.clockOut || entry.date < start || entry.date > end) continue;
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + hoursBetween(entry.clockIn, entry.clockOut));
  }
  return totals;
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
) {
  const schedule = getSchedule(employee.scheduleId, schedules);
  const effectiveStart = employee.employmentStartDate
    ? maxIsoDate(employee.employmentStartDate, start)
    : start;
  if (effectiveStart > end) {
    return {
      daysWorked: 0,
      hoursWorked: 0,
      holidayCount: 0,
      scheduleHoursPerDay: schedule.hoursPerDay,
    };
  }

  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  const actualHoursByDate = sumActualHoursByDate(employee.id, effectiveStart, end, timeEntries);
  const scheduledDays = countScheduledDays(schedule, effectiveStart, end, holidaySet);
  let hoursWorked = 0;
  let daysWorked = 0;
  const scheduledDates = new Set<string>();

  for (let cursor = effectiveStart; cursor <= end; cursor = addDays(cursor, 1)) {
    const dayOfWeek = parseIsoDate(cursor).getUTCDay();
    const isScheduledWorkDay = schedule.workingDays.includes(dayOfWeek) && !holidaySet.has(cursor);
    if (!isScheduledWorkDay) continue;

    scheduledDates.add(cursor);
    if (employee.timeTrackingMode === "schedule_based") {
      daysWorked += 1;
      hoursWorked += schedule.hoursPerDay;
      continue;
    }

    const actualHours = actualHoursByDate.get(cursor);
    if (typeof actualHours === "number") {
      daysWorked += 1;
      hoursWorked += actualHours;
    } else {
      // For testing/live previews, accrued payroll falls back to the assigned schedule when no entry exists yet.
      daysWorked += 1;
      hoursWorked += schedule.hoursPerDay;
    }
  }

  if (employee.timeTrackingMode === "check_in_out") {
    for (const [date, actualHours] of actualHoursByDate.entries()) {
      if (scheduledDates.has(date)) continue;
      daysWorked += 1;
      hoursWorked += actualHours;
    }
  }

  return {
    daysWorked,
    hoursWorked,
    holidayCount: countHolidays(effectiveStart, end, holidaySet),
    scheduleHoursPerDay: schedule.hoursPerDay,
    scheduledDays,
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
  withdrawals: WithdrawalRecord[],
  schedules: ScheduleRecord[],
  holidays: HolidayRecord[],
  timeEntries: TimeEntryRecord[],
  today: string,
): RecipientMetrics {
  const { periodStart, periodEnd } = currentSemimonthlyPeriod(today);
  const currentStats = periodStats(
    employee,
    periodStart,
    today < periodEnd ? today : periodEnd,
    schedules,
    holidays,
    timeEntries,
  );
  const ytdWindowStart = yearStart(today);
  const ytdStats = periodStats(employee, ytdWindowStart, today, schedules, holidays, timeEntries);
  const paidPayRunIds = new Set(
    payRuns
      .filter((payRun) => overlaps(payRun.periodStart, payRun.periodEnd, ytdWindowStart, today))
      .filter((payRun) => payRun.status === "executed" || payRun.status === "processing")
      .map((payRun) => payRun.id),
  );
  const totalPaidCents =
    payRunItems
      .filter((item) => item.employeeId === employee.id && paidPayRunIds.has(item.payRunId))
      .filter((item) => item.status !== "failed")
      .reduce((total, item) => total + item.amountCents, 0) +
    withdrawals
      .filter((withdrawal) => withdrawal.employeeId === employee.id)
      .filter((withdrawal) => withdrawal.status === "paid" || withdrawal.status === "processing")
      .filter((withdrawal) => overlaps(withdrawal.periodStart, withdrawal.periodEnd, ytdWindowStart, today))
      .reduce((total, withdrawal) => total + withdrawal.amountCents, 0);

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
  payRuns: PayRunRecord[],
  payRunItems: PayRunItemRecord[],
  withdrawals: WithdrawalRecord[],
  schedules: ScheduleRecord[],
  holidays: HolidayRecord[],
  timeEntries: TimeEntryRecord[],
  periodStart: string,
  periodEnd: string,
  today: string,
  arcChainId: number,
): PayRunItemPreview[] {
  const isForecast = periodStart > today;
  const settledPayRunIds = new Set(
    payRuns
      .filter((payRun) => overlaps(payRun.periodStart, payRun.periodEnd, periodStart, periodEnd))
      .filter((payRun) => payRun.status === "executed" || payRun.status === "processing")
      .map((payRun) => payRun.id),
  );
  return employees.map((employee) => {
    const stats = periodStats(employee, periodStart, periodEnd, schedules, holidays, timeEntries);
    const earnedCents = earningsForStats(employee, stats);
    const alreadyPaidCents =
      payRunItems
        .filter((item) => item.employeeId === employee.id && settledPayRunIds.has(item.payRunId))
        .filter((item) => item.status !== "failed")
        .reduce((total, item) => total + item.amountCents, 0) +
      withdrawals
        .filter((withdrawal) => withdrawal.employeeId === employee.id)
        .filter((withdrawal) => withdrawal.status === "paid" || withdrawal.status === "processing")
        .filter((withdrawal) => overlaps(withdrawal.periodStart, withdrawal.periodEnd, periodStart, periodEnd))
        .reduce((total, withdrawal) => total + withdrawal.amountCents, 0);
    const amountCents = Math.max(earnedCents - alreadyPaidCents, 0);
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
