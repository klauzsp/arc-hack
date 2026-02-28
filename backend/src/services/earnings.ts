/**
 * Earnings computation service.
 *
 * For each employee, compute:
 *  - earnedToDate: pro-rated earnings from period start (or year start) to now
 *  - totalPaid:    sum of executed pay run items for this employee
 *  - availableToWithdraw: earnedToDate - totalPaid
 */
import { queryAll, queryOne } from "../db/connection.js";

interface EarningsResult {
  earnedToDate: number;
  totalPaid: number;
  availableToWithdraw: number;
}

/**
 * Compute pro-rated earnings for an employee from `periodStart` to `asOf`.
 * Handles yearly, daily, and hourly pay types.
 */
export function computeEarnings(
  employeeId: string,
  periodStart?: string,
  asOf?: string
): EarningsResult {
  const now = asOf ? new Date(asOf) : new Date();
  const employee = queryOne("SELECT * FROM employee WHERE id = ?", [employeeId]) as any;

  if (!employee) {
    return { earnedToDate: 0, totalPaid: 0, availableToWithdraw: 0 };
  }

  const start = periodStart
    ? new Date(periodStart)
    : new Date(now.getFullYear(), 0, 1); // default: year start

  const earned = computeProRatedEarnings(employee, start, now);

  // Total paid = sum of executed pay_run_items
  const row = queryOne(
    `SELECT COALESCE(SUM(pri.amount), 0) as total_paid
     FROM pay_run_item pri
     JOIN pay_run pr ON pr.id = pri.pay_run_id
     WHERE pri.employee_id = ? AND pr.status = 'executed'`,
    [employeeId]
  ) as { total_paid: number };

  const totalPaid = row.total_paid;
  const availableToWithdraw = Math.max(0, earned - totalPaid);

  return {
    earnedToDate: Math.round(earned * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    availableToWithdraw: Math.round(availableToWithdraw * 100) / 100,
  };
}

function computeProRatedEarnings(
  employee: any,
  periodStart: Date,
  asOf: Date
): number {
  const { pay_type, rate, schedule_id, time_tracking_mode } = employee;

  if (pay_type === "yearly") {
    // Pro-rate: (rate / 365) * calendar days elapsed
    const msPerDay = 86_400_000;
    const daysElapsed = Math.max(0, (asOf.getTime() - periodStart.getTime()) / msPerDay);
    return (rate / 365) * daysElapsed;
  }

  if (pay_type === "daily") {
    // Count working days in period
    const workingDays = countWorkingDays(employee, periodStart, asOf);
    return rate * workingDays;
  }

  if (pay_type === "hourly") {
    if (time_tracking_mode === "check_in_out") {
      // Sum actual hours from time_entry
      return rate * getLoggedHours(employee.id, periodStart, asOf);
    }
    // schedule_based: working days * hours_per_day
    const schedule = getSchedule(schedule_id);
    const workingDays = countWorkingDays(employee, periodStart, asOf);
    const hoursPerDay = schedule?.hours_per_day ?? 8;
    return rate * workingDays * hoursPerDay;
  }

  return 0;
}

function countWorkingDays(employee: any, from: Date, to: Date): number {
  const schedule = getSchedule(employee.schedule_id);
  const workingDaySet = new Set<number>(
    schedule ? JSON.parse(schedule.working_days) : [1, 2, 3, 4, 5]
  );

  // Get holidays
  const holidays = new Set(
    (
      queryAll("SELECT date FROM holiday WHERE company_id = ?", [employee.company_id]) as { date: string }[]
    ).map((h) => h.date)
  );

  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const dayOfWeek = cursor.getDay();
    const isoDate = cursor.toISOString().slice(0, 10);
    if (workingDaySet.has(dayOfWeek) && !holidays.has(isoDate)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function getLoggedHours(employeeId: string, from: Date, to: Date): number {
  const entries = queryAll(
    "SELECT clock_in, clock_out FROM time_entry WHERE employee_id = ? AND date >= ? AND date <= ?",
    [employeeId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
  ) as { clock_in: string; clock_out: string | null }[];

  let total = 0;
  for (const e of entries) {
    if (!e.clock_out) continue;
    const [inH, inM] = e.clock_in.split(":").map(Number);
    const [outH, outM] = e.clock_out.split(":").map(Number);
    const hours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
    if (hours > 0) total += hours;
  }
  return total;
}

function getSchedule(scheduleId: string | null) {
  if (!scheduleId) return null;
  return queryOne("SELECT * FROM schedule WHERE id = ?", [scheduleId]) as any;
}
