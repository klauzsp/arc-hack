"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dollarsFromCents = dollarsFromCents;
exports.centsFromDollars = centsFromDollars;
exports.chainIdFromPreference = chainIdFromPreference;
exports.getSchedule = getSchedule;
exports.buildHourlyEntries = buildHourlyEntries;
exports.calculateRecipientMetrics = calculateRecipientMetrics;
exports.buildPayRunItemsPreview = buildPayRunItemsPreview;
exports.suggestClockInTime = suggestClockInTime;
exports.suggestClockOutTime = suggestClockOutTime;
const dates_1 = require("../lib/dates");
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
];
function roundCents(value) {
    return Math.round(value);
}
function dollarsFromCents(value) {
    return Number((value / 100).toFixed(2));
}
function centsFromDollars(value) {
    return Math.round(value * 100);
}
function chainIdFromPreference(chainPreference, arcChainId) {
    if (chainPreference === "Base")
        return 8453;
    if (chainPreference === "Arbitrum")
        return 42161;
    if (chainPreference === "Ethereum")
        return 11155111;
    return arcChainId;
}
function getSchedule(scheduleId, schedules) {
    return schedules.find((schedule) => schedule.id === scheduleId) ?? schedules[0];
}
function countHolidays(start, end, holidaySet) {
    let total = 0;
    for (let cursor = start; cursor <= end; cursor = (0, dates_1.addDays)(cursor, 1)) {
        if (holidaySet.has(cursor))
            total += 1;
    }
    return total;
}
function countScheduledDays(schedule, start, end, holidaySet) {
    let total = 0;
    for (let cursor = start; cursor <= end; cursor = (0, dates_1.addDays)(cursor, 1)) {
        const dayOfWeek = (0, dates_1.parseIsoDate)(cursor).getUTCDay();
        if (schedule.workingDays.includes(dayOfWeek) && !holidaySet.has(cursor)) {
            total += 1;
        }
    }
    return total;
}
function buildHourlyEntries(employeeId, schedule, start, end, holidays, offset) {
    const holidaySet = new Set(holidays.map((holiday) => holiday.date));
    const entries = [];
    let dayIndex = 0;
    for (let cursor = start; cursor <= end; cursor = (0, dates_1.addDays)(cursor, 1)) {
        const dayOfWeek = (0, dates_1.parseIsoDate)(cursor).getUTCDay();
        if (!schedule.workingDays.includes(dayOfWeek) || holidaySet.has(cursor))
            continue;
        const pattern = HOURLY_SHIFT_PATTERNS[(dayIndex + offset) % HOURLY_SHIFT_PATTERNS.length];
        entries.push({
            id: `${employeeId}-${cursor}-1`,
            employeeId,
            date: cursor,
            clockIn: pattern[0].clockIn,
            clockOut: pattern[0].clockOut,
        }, {
            id: `${employeeId}-${cursor}-2`,
            employeeId,
            date: cursor,
            clockIn: pattern[1].clockIn,
            clockOut: pattern[1].clockOut,
        });
        dayIndex += 1;
    }
    return entries;
}
function periodStats(employee, start, end, schedules, holidays, timeEntries, mode) {
    const holidaySet = new Set(holidays.map((holiday) => holiday.date));
    const schedule = getSchedule(employee.scheduleId, schedules);
    const scheduledDays = countScheduledDays(schedule, start, end, holidaySet);
    const scheduledHours = scheduledDays * schedule.hoursPerDay;
    const relevantEntries = timeEntries.filter((entry) => entry.employeeId === employee.id &&
        entry.date >= start &&
        entry.date <= end &&
        entry.clockOut);
    const actualHours = relevantEntries.reduce((total, entry) => total + (0, dates_1.hoursBetween)(entry.clockIn, entry.clockOut), 0);
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
function earningsForStats(employee, stats) {
    if (employee.payType === "hourly")
        return roundCents(employee.rateCents * stats.hoursWorked);
    if (employee.payType === "daily")
        return roundCents(employee.rateCents * stats.daysWorked);
    return roundCents((employee.rateCents / dates_1.WORKING_DAYS_IN_YEAR) * stats.daysWorked);
}
function calculateRecipientMetrics(employee, payRuns, payRunItems, schedules, holidays, timeEntries, today) {
    const { periodStart, periodEnd } = (0, dates_1.currentSemimonthlyPeriod)(today);
    const currentStats = periodStats(employee, periodStart, periodEnd, schedules, holidays, timeEntries, "actual");
    const ytdStats = periodStats(employee, (0, dates_1.yearStart)(today), today, schedules, holidays, timeEntries, "actual");
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
function buildPayRunItemsPreview(employees, schedules, holidays, timeEntries, periodStart, periodEnd, today, arcChainId) {
    const isForecast = periodStart > today;
    return employees.map((employee) => {
        const stats = periodStats(employee, periodStart, periodEnd, schedules, holidays, timeEntries, isForecast ? "forecast" : "actual");
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
function suggestClockInTime(employeeId, today, timeEntries) {
    const todaysEntries = timeEntries.filter((entry) => entry.employeeId === employeeId && entry.date === today);
    if (todaysEntries.length === 0)
        return "09:00";
    if (todaysEntries.length === 1)
        return "13:15";
    return (0, dates_1.addClockHours)(todaysEntries[todaysEntries.length - 1].clockOut ?? "17:00", 0.5);
}
function suggestClockOutTime(employeeId, today, timeEntries, clockIn) {
    const todaysEntries = timeEntries.filter((entry) => entry.employeeId === employeeId && entry.date === today);
    if (todaysEntries.length === 0)
        return "12:30";
    if (todaysEntries.length === 1)
        return "17:15";
    return (0, dates_1.addClockHours)(clockIn, 3.5);
}
