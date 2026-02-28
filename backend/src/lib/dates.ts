export const WORKING_DAYS_IN_YEAR = 260;

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function todayIso(reference = new Date()) {
  return formatIsoDate(new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 12)));
}

export function nowIso(reference = new Date()) {
  return reference.toISOString();
}

export function addDays(value: string, days: number) {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDate(next);
}

export function endOfMonth(value: string) {
  const date = parseIsoDate(value);
  return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
}

export function isoClock(reference = new Date()) {
  return reference.toISOString().slice(11, 16);
}

export function currentSemimonthlyPeriod(today: string) {
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

export function yearStart(today: string) {
  const date = parseIsoDate(today);
  return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12)));
}

export function hoursBetween(clockIn: string, clockOut: string) {
  const [inHours, inMinutes] = clockIn.split(":").map(Number);
  const [outHours, outMinutes] = clockOut.split(":").map(Number);
  return (outHours * 60 + outMinutes - (inHours * 60 + inMinutes)) / 60;
}

export function addClockHours(clock: string, hours: number) {
  const [baseHours, baseMinutes] = clock.split(":").map(Number);
  const totalMinutes = baseHours * 60 + baseMinutes + Math.round(hours * 60);
  const nextHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}
