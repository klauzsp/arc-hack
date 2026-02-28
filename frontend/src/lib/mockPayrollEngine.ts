import type {
  PayRun,
  PayRunItem,
  PayRunStatus,
  Recipient,
  Schedule,
  TimeEntry,
} from "./mockTypes";

export const MOCK_TODAY = "2025-02-28";
export const CURRENT_PERIOD_START = "2025-02-16";
export const CURRENT_PERIOD_END = "2025-02-28";
export const YTD_START = "2025-01-01";
export const WORKING_DAYS_IN_YEAR = 260;

export interface RecipientMetrics {
  currentPeriodEarned: number;
  ytdEarned: number;
  totalPaid: number;
  availableToWithdraw: number;
  currentPeriodHours: number;
  ytdHours: number;
  currentPeriodDays: number;
  ytdDays: number;
  currentPeriodHolidayCount: number;
  ytdHolidayCount: number;
  scheduleHoursPerDay: number;
}

type PayRunBlueprint = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  txHash?: string;
  executedAt?: string;
};

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

const PAY_RUN_BLUEPRINTS: PayRunBlueprint[] = [
  {
    id: "pr-1",
    periodStart: "2025-01-01",
    periodEnd: "2025-01-15",
    status: "executed",
    txHash: "0x7a3f...e12d",
    executedAt: "2025-01-16T09:30:00Z",
  },
  {
    id: "pr-2",
    periodStart: "2025-01-16",
    periodEnd: "2025-01-31",
    status: "executed",
    txHash: "0x9bc4...8f2e",
    executedAt: "2025-02-01T10:15:00Z",
  },
  {
    id: "pr-3",
    periodStart: "2025-02-01",
    periodEnd: "2025-02-15",
    status: "executed",
    txHash: "0xabc1...3d4e",
    executedAt: "2025-02-16T10:00:00Z",
  },
  {
    id: "pr-4",
    periodStart: "2025-02-16",
    periodEnd: "2025-02-28",
    status: "approved",
  },
  {
    id: "pr-5",
    periodStart: "2025-03-01",
    periodEnd: "2025-03-15",
    status: "draft",
  },
];

export const mockSchedules: Schedule[] = [
  {
    id: "s-1",
    name: "Headquarters",
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    timezone: "America/New_York",
  },
  {
    id: "s-2",
    name: "Operations",
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 7.5,
    timezone: "America/Los_Angeles",
  },
];

export const mockHolidays: string[] = [
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-05-26",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
];

export const seedRecipients: Recipient[] = [
  {
    id: "r-1",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f3a1f",
    name: "Alice Chen",
    payType: "yearly",
    rate: 95000,
    chainPreference: "Arc",
    timeTrackingMode: "schedule_based",
    scheduleId: "s-1",
  },
  {
    id: "r-2",
    walletAddress: "0x8b2ef3a24c6e8Bb1a5290AeD04269d9c4d",
    name: "Bob Smith",
    payType: "hourly",
    rate: 45,
    chainPreference: "Base",
    timeTrackingMode: "check_in_out",
    scheduleId: "s-1",
  },
  {
    id: "r-3",
    walletAddress: "0x1f3a7DcBe9F2a41c5948e7a3b8C02e7e2b",
    name: "Carol Davis",
    payType: "daily",
    rate: 320,
    chainPreference: "Arc",
    timeTrackingMode: "schedule_based",
    scheduleId: "s-1",
  },
  {
    id: "r-4",
    walletAddress: "0x4e8c2Bf0a93D71c84aFe3b2109d5c8f1e2",
    name: "David Park",
    payType: "yearly",
    rate: 78000,
    chainPreference: "Arbitrum",
    timeTrackingMode: "schedule_based",
    scheduleId: "s-2",
  },
  {
    id: "r-5",
    walletAddress: "0xa7f3E9c1b24D068e5A3f1c28B94d7e0a5b",
    name: "Emma Wilson",
    payType: "hourly",
    rate: 55,
    chainPreference: "Arc",
    timeTrackingMode: "check_in_out",
    scheduleId: "s-1",
  },
  {
    id: "r-6",
    walletAddress: "0x3b9cA1d7E823f0a64B2e8D1c5F07a3e9d4",
    name: "Frank Lopez",
    payType: "yearly",
    rate: 112000,
    chainPreference: "Arc",
    timeTrackingMode: "schedule_based",
    scheduleId: "s-1",
  },
  {
    id: "r-7",
    walletAddress: "0x81c4bBaA91Da4F8f6C56F4f2dB8aB2C7F94e1234",
    name: "Grace Kim",
    payType: "daily",
    rate: 285,
    chainPreference: "Ethereum",
    timeTrackingMode: "schedule_based",
    scheduleId: "s-2",
  },
  {
    id: "r-8",
    walletAddress: "0x54eFA92AC4d3B70011b0563B86Ae2bC1506aF77C",
    name: "Hector Ruiz",
    payType: "hourly",
    rate: 38,
    chainPreference: "Base",
    timeTrackingMode: "check_in_out",
    scheduleId: "s-2",
  },
];

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDate(next);
}

function endOfMonth(value: string) {
  const date = parseIsoDate(value);
  return formatIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
}

function hoursBetween(clockIn: string, clockOut: string) {
  const [inHours, inMinutes] = clockIn.split(":").map(Number);
  const [outHours, outMinutes] = clockOut.split(":").map(Number);
  return (outHours * 60 + outMinutes - (inHours * 60 + inMinutes)) / 60;
}

function roundCurrency(value: number) {
  return Math.round(value);
}

function getSchedule(scheduleId: string | undefined, schedules: Schedule[]) {
  return (
    schedules.find((schedule) => schedule.id === scheduleId) ??
    schedules[0]
  );
}

function countHolidays(start: string, end: string, holidaySet: Set<string>) {
  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if (holidaySet.has(cursor)) total += 1;
  }
  return total;
}

function countScheduledDays(
  schedule: Schedule,
  start: string,
  end: string,
  holidaySet: Set<string>,
) {
  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dayOfWeek = parseIsoDate(cursor).getUTCDay();
    if (schedule.workingDays.includes(dayOfWeek) && !holidaySet.has(cursor)) {
      total += 1;
    }
  }
  return total;
}

function buildHourlyEntries(
  recipientId: string,
  schedule: Schedule,
  start: string,
  end: string,
  holidaySet: Set<string>,
  offset: number,
): TimeEntry[] {
  const entries: TimeEntry[] = [];
  let dayIndex = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dayOfWeek = parseIsoDate(cursor).getUTCDay();
    if (!schedule.workingDays.includes(dayOfWeek) || holidaySet.has(cursor)) {
      continue;
    }
    const pattern = HOURLY_SHIFT_PATTERNS[(dayIndex + offset) % HOURLY_SHIFT_PATTERNS.length];
    entries.push(
      {
        id: `${recipientId}-${cursor}-1`,
        recipientId,
        date: cursor,
        clockIn: pattern[0].clockIn,
        clockOut: pattern[0].clockOut,
      },
      {
        id: `${recipientId}-${cursor}-2`,
        recipientId,
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
  recipient: Recipient,
  start: string,
  end: string,
  schedules: Schedule[],
  holidaySet: Set<string>,
  timeEntries: TimeEntry[],
  mode: "actual" | "forecast",
) {
  const schedule = getSchedule(recipient.scheduleId, schedules);
  const scheduledDays = countScheduledDays(schedule, start, end, holidaySet);
  const scheduleHoursPerDay = schedule.hoursPerDay;
  const scheduledHours = scheduledDays * scheduleHoursPerDay;
  const recipientEntries = timeEntries.filter(
    (entry) =>
      entry.recipientId === recipient.id &&
      entry.date >= start &&
      entry.date <= end,
  );
  const actualHours = recipientEntries.reduce(
    (total, entry) => total + hoursBetween(entry.clockIn, entry.clockOut),
    0,
  );
  const actualDays = new Set(recipientEntries.map((entry) => entry.date)).size;
  const useForecast = mode === "forecast";
  const hoursWorked = useForecast
    ? actualHours || scheduledHours
    : recipient.timeTrackingMode === "check_in_out"
      ? actualHours
      : scheduledHours;
  const daysWorked = useForecast
    ? actualDays || scheduledDays
    : recipient.timeTrackingMode === "check_in_out"
      ? actualDays
      : scheduledDays;

  return {
    daysWorked,
    hoursWorked,
    holidayCount: countHolidays(start, end, holidaySet),
    scheduleHoursPerDay,
  };
}

function earningsForStats(
  recipient: Recipient,
  stats: { daysWorked: number; hoursWorked: number },
) {
  if (recipient.payType === "hourly") {
    return roundCurrency(recipient.rate * stats.hoursWorked);
  }
  if (recipient.payType === "daily") {
    return roundCurrency(recipient.rate * stats.daysWorked);
  }
  return roundCurrency((recipient.rate / WORKING_DAYS_IN_YEAR) * stats.daysWorked);
}

function buildPayRunItems(
  recipients: Recipient[],
  periodStart: string,
  periodEnd: string,
  schedules: Schedule[],
  holidays: string[],
  timeEntries: TimeEntry[],
) {
  const holidaySet = new Set(holidays);
  const isForecast = periodStart > MOCK_TODAY;
  const items: PayRunItem[] = recipients.map((recipient) => {
    const stats = periodStats(
      recipient,
      periodStart,
      periodEnd,
      schedules,
      holidaySet,
      timeEntries,
      isForecast ? "forecast" : "actual",
    );
    const chainId =
      recipient.chainPreference === "Base"
        ? 8453
        : recipient.chainPreference === "Arbitrum"
          ? 42161
          : recipient.chainPreference === "Ethereum"
            ? 11155111
            : 1;

    return {
      recipientId: recipient.id,
      amount: earningsForStats(recipient, stats),
      chainId,
      status: periodEnd <= MOCK_TODAY ? "ready" : "forecast",
    };
  });

  return items;
}

export function buildMockPayRuns(
  recipients: Recipient[],
  schedules: Schedule[],
  holidays: string[],
  timeEntries: TimeEntry[],
) {
  return PAY_RUN_BLUEPRINTS.map((blueprint) => {
    const items = buildPayRunItems(
      recipients,
      blueprint.periodStart,
      blueprint.periodEnd,
      schedules,
      holidays,
      timeEntries,
    ).map((item) => ({
      ...item,
      status:
        blueprint.status === "executed"
          ? "paid"
          : blueprint.status === "approved"
            ? "ready"
            : item.status,
    }));
    const totalAmount = items.reduce((total, item) => total + item.amount, 0);

    return {
      ...blueprint,
      items,
      totalAmount,
      recipientCount: items.length,
    } satisfies PayRun;
  });
}

export const seedTimeEntries: TimeEntry[] = [
  ...buildHourlyEntries(
    "r-2",
    getSchedule("s-1", mockSchedules),
    YTD_START,
    addDays(MOCK_TODAY, -1),
    new Set(mockHolidays),
    0,
  ),
  ...buildHourlyEntries(
    "r-5",
    getSchedule("s-1", mockSchedules),
    YTD_START,
    addDays(MOCK_TODAY, -1),
    new Set(mockHolidays),
    1,
  ),
  ...buildHourlyEntries(
    "r-8",
    getSchedule("s-2", mockSchedules),
    YTD_START,
    addDays(MOCK_TODAY, -1),
    new Set(mockHolidays),
    2,
  ),
];

export const seedPayRuns = buildMockPayRuns(
  seedRecipients,
  mockSchedules,
  mockHolidays,
  seedTimeEntries,
);

export function calculateRecipientMetrics(
  recipient: Recipient,
  payRuns: PayRun[],
  schedules: Schedule[],
  holidays: string[],
  timeEntries: TimeEntry[],
) {
  const holidaySet = new Set(holidays);
  const currentStats = periodStats(
    recipient,
    CURRENT_PERIOD_START,
    CURRENT_PERIOD_END,
    schedules,
    holidaySet,
    timeEntries,
    "actual",
  );
  const ytdStats = periodStats(
    recipient,
    YTD_START,
    MOCK_TODAY,
    schedules,
    holidaySet,
    timeEntries,
    "actual",
  );
  const currentPeriodEarned = earningsForStats(recipient, currentStats);
  const ytdEarned = earningsForStats(recipient, ytdStats);
  const totalPaid = payRuns
    .filter((payRun) => payRun.status === "executed")
    .flatMap((payRun) => payRun.items ?? [])
    .filter((item) => item.recipientId === recipient.id)
    .reduce((total, item) => total + item.amount, 0);

  return {
    currentPeriodEarned,
    ytdEarned,
    totalPaid,
    availableToWithdraw: Math.max(ytdEarned - totalPaid, 0),
    currentPeriodHours: Number(currentStats.hoursWorked.toFixed(1)),
    ytdHours: Number(ytdStats.hoursWorked.toFixed(1)),
    currentPeriodDays: currentStats.daysWorked,
    ytdDays: ytdStats.daysWorked,
    currentPeriodHolidayCount: currentStats.holidayCount,
    ytdHolidayCount: ytdStats.holidayCount,
    scheduleHoursPerDay: currentStats.scheduleHoursPerDay,
  } satisfies RecipientMetrics;
}

export function createNextPayRun(
  payRuns: PayRun[],
  recipients: Recipient[],
  schedules: Schedule[],
  holidays: string[],
  timeEntries: TimeEntry[],
) {
  const lastPayRun = payRuns[payRuns.length - 1];
  const nextStart = addDays(lastPayRun.periodEnd, 1);
  const nextStartDate = parseIsoDate(nextStart);
  const nextEnd =
    nextStartDate.getUTCDate() <= 15
      ? formatIsoDate(
          new Date(Date.UTC(nextStartDate.getUTCFullYear(), nextStartDate.getUTCMonth(), 15, 12)),
        )
      : endOfMonth(nextStart);
  const items = buildPayRunItems(
    recipients,
    nextStart,
    nextEnd,
    schedules,
    holidays,
    timeEntries,
  );
  const totalAmount = items.reduce((total, item) => total + item.amount, 0);

  return {
    id: `pr-${payRuns.length + 1}`,
    periodStart: nextStart,
    periodEnd: nextEnd,
    status: "draft",
    items,
    totalAmount,
    recipientCount: items.length,
  } satisfies PayRun;
}

export function repriceUpcomingPayRuns(
  payRuns: PayRun[],
  recipients: Recipient[],
  schedules: Schedule[],
  holidays: string[],
  timeEntries: TimeEntry[],
) {
  return payRuns.map((payRun) => {
    if (payRun.status === "executed") return payRun;

    const items = buildPayRunItems(
      recipients,
      payRun.periodStart,
      payRun.periodEnd,
      schedules,
      holidays,
      timeEntries,
    );

    return {
      ...payRun,
      items,
      totalAmount: items.reduce((total, item) => total + item.amount, 0),
      recipientCount: items.length,
    };
  });
}

export function isKnownRecipientAddress(address: string | undefined) {
  if (!address) return false;
  return seedRecipients.some(
    (recipient) =>
      recipient.walletAddress.toLowerCase() === address.toLowerCase(),
  );
}

export function getSuggestedClockInTime(recipientId: string, timeEntries: TimeEntry[]) {
  const todaysEntries = timeEntries.filter(
    (entry) => entry.recipientId === recipientId && entry.date === MOCK_TODAY,
  );
  if (todaysEntries.length === 0) return "09:00";
  if (todaysEntries.length === 1) return "13:15";
  return addClockHours(todaysEntries[todaysEntries.length - 1].clockOut, 0.5);
}

export function getSuggestedClockOutTime(
  recipientId: string,
  timeEntries: TimeEntry[],
  clockIn: string,
) {
  const todaysEntries = timeEntries.filter(
    (entry) => entry.recipientId === recipientId && entry.date === MOCK_TODAY,
  );
  if (todaysEntries.length === 0) return "12:30";
  if (todaysEntries.length === 1) return "17:15";
  return addClockHours(clockIn, 3.5);
}

function addClockHours(clock: string, hours: number) {
  const [baseHours, baseMinutes] = clock.split(":").map(Number);
  const totalMinutes = baseHours * 60 + baseMinutes + Math.round(hours * 60);
  const nextHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}

export function generateMockTxHash(payRunId: string) {
  return `0x${payRunId.replace(/[^a-z0-9]/gi, "").padEnd(8, "a")}...${payRunId.slice(-2).padStart(2, "0")}`;
}
