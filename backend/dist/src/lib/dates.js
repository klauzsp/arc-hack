"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKING_DAYS_IN_YEAR = void 0;
exports.parseIsoDate = parseIsoDate;
exports.formatIsoDate = formatIsoDate;
exports.todayIso = todayIso;
exports.nowIso = nowIso;
exports.addDays = addDays;
exports.endOfMonth = endOfMonth;
exports.isoClock = isoClock;
exports.currentSemimonthlyPeriod = currentSemimonthlyPeriod;
exports.yearStart = yearStart;
exports.hoursBetween = hoursBetween;
exports.addClockHours = addClockHours;
exports.WORKING_DAYS_IN_YEAR = 260;
function parseIsoDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
}
function formatIsoDate(value) {
    return value.toISOString().slice(0, 10);
}
function todayIso(reference = new Date()) {
    return formatIsoDate(new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 12)));
}
function nowIso(reference = new Date()) {
    return reference.toISOString();
}
function addDays(value, days) {
    const next = parseIsoDate(value);
    next.setUTCDate(next.getUTCDate() + days);
    return formatIsoDate(next);
}
function endOfMonth(value) {
    const date = parseIsoDate(value);
    return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
}
function isoClock(reference = new Date()) {
    return reference.toISOString().slice(11, 16);
}
function currentSemimonthlyPeriod(today) {
    const date = parseIsoDate(today);
    const day = date.getUTCDate();
    if (day <= 15) {
        return {
            periodStart: formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12))),
            periodEnd: formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15, 12))),
        };
    }
    return {
        periodStart: formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 16, 12))),
        periodEnd: endOfMonth(today),
    };
}
function yearStart(today) {
    const date = parseIsoDate(today);
    return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12)));
}
function hoursBetween(clockIn, clockOut) {
    const [inHours, inMinutes] = clockIn.split(":").map(Number);
    const [outHours, outMinutes] = clockOut.split(":").map(Number);
    return (outHours * 60 + outMinutes - (inHours * 60 + inMinutes)) / 60;
}
function addClockHours(clock, hours) {
    const [baseHours, baseMinutes] = clock.split(":").map(Number);
    const totalMinutes = baseHours * 60 + baseMinutes + Math.round(hours * 60);
    const nextHours = Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, "0");
    const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");
    return `${nextHours}:${nextMinutes}`;
}
