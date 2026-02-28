import { addDays, yearStart } from "../lib/dates";
import { buildHourlyEntries, chainIdFromPreference } from "./payroll";
import type {
  CompanyRecord,
  EmployeeRecord,
  HolidayRecord,
  PayRunItemRecord,
  PayRunRecord,
  PolicyRecord,
  ScheduleRecord,
  TimeEntryRecord,
  TreasuryBalanceRecord,
  WithdrawalRecord,
} from "./types";

interface SeedPayload {
  company: CompanyRecord;
  treasuryBalances: TreasuryBalanceRecord[];
  employees: EmployeeRecord[];
  schedules: ScheduleRecord[];
  holidays: HolidayRecord[];
  timeEntries: TimeEntryRecord[];
  payRuns: PayRunRecord[];
  payRunItems: PayRunItemRecord[];
  policies: PolicyRecord[];
  withdrawals: WithdrawalRecord[];
}

export function createSeedPayload(input: {
  companyId: string;
  companyName: string;
  today: string;
  arcChainId: number;
}): SeedPayload {
  const { companyId, companyName, today, arcChainId } = input;
  const year = Number(today.slice(0, 4));
  const ytdStart = yearStart(today);

  const company: CompanyRecord = {
    id: companyId,
    name: companyName,
    payFrequency: "semimonthly",
    defaultTimeTrackingMode: "schedule_based",
    treasuryUsycCents: 320_000_00,
    autoRebalanceEnabled: true,
    autoRedeemEnabled: true,
    rebalanceThresholdCents: 120_000_00,
    payoutNoticeHours: 24,
  };

  const schedules: ScheduleRecord[] = [
    {
      id: "s-1",
      companyId,
      name: "Headquarters",
      timezone: "America/New_York",
      hoursPerDay: 8,
      workingDays: [1, 2, 3, 4, 5],
    },
    {
      id: "s-2",
      companyId,
      name: "Operations",
      timezone: "America/Los_Angeles",
      hoursPerDay: 7.5,
      workingDays: [1, 2, 3, 4, 5],
    },
  ];

  const holidays: HolidayRecord[] = [
    { id: "h-1", companyId, date: `${year}-01-01`, name: "New Year" },
    { id: "h-2", companyId, date: `${year}-01-19`, name: "MLK Day" },
    { id: "h-3", companyId, date: `${year}-02-16`, name: "Presidents Day" },
    { id: "h-4", companyId, date: `${year}-05-25`, name: "Memorial Day" },
    { id: "h-5", companyId, date: `${year}-07-04`, name: "Independence Day" },
    { id: "h-6", companyId, date: `${year}-09-07`, name: "Labor Day" },
    { id: "h-7", companyId, date: `${year}-11-26`, name: "Thanksgiving" },
    { id: "h-8", companyId, date: `${year}-12-25`, name: "Christmas" },
  ];

  const employees: EmployeeRecord[] = [
    {
      id: "r-1",
      companyId,
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f3a1f".toLowerCase(),
      name: "Alice Chen",
      role: "employee",
      payType: "yearly",
      rateCents: 95_000_00,
      chainPreference: "Arc",
      destinationChainId: arcChainId,
      destinationWalletAddress: null,
      scheduleId: "s-1",
      timeTrackingMode: "schedule_based",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-2",
      companyId,
      walletAddress: "0x8b2ef3a24c6e8Bb1a5290AeD04269d9c4d".toLowerCase(),
      name: "Bob Smith",
      role: "employee",
      payType: "hourly",
      rateCents: 45_00,
      chainPreference: "Base",
      destinationChainId: 8453,
      destinationWalletAddress: null,
      scheduleId: "s-1",
      timeTrackingMode: "check_in_out",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-3",
      companyId,
      walletAddress: "0x1f3a7DcBe9F2a41c5948e7a3b8C02e7e2b".toLowerCase(),
      name: "Carol Davis",
      role: "employee",
      payType: "daily",
      rateCents: 320_00,
      chainPreference: "Arc",
      destinationChainId: arcChainId,
      destinationWalletAddress: null,
      scheduleId: "s-1",
      timeTrackingMode: "schedule_based",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-4",
      companyId,
      walletAddress: "0x4e8c2Bf0a93D71c84aFe3b2109d5c8f1e2".toLowerCase(),
      name: "David Park",
      role: "employee",
      payType: "yearly",
      rateCents: 78_000_00,
      chainPreference: "Arbitrum",
      destinationChainId: 42161,
      destinationWalletAddress: null,
      scheduleId: "s-2",
      timeTrackingMode: "schedule_based",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-5",
      companyId,
      walletAddress: "0xa7f3E9c1b24D068e5A3f1c28B94d7e0a5b".toLowerCase(),
      name: "Emma Wilson",
      role: "employee",
      payType: "hourly",
      rateCents: 55_00,
      chainPreference: "Arc",
      destinationChainId: arcChainId,
      destinationWalletAddress: null,
      scheduleId: "s-1",
      timeTrackingMode: "check_in_out",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-6",
      companyId,
      walletAddress: "0x3b9cA1d7E823f0a64B2e8D1c5F07a3e9d4".toLowerCase(),
      name: "Frank Lopez",
      role: "employee",
      payType: "yearly",
      rateCents: 112_000_00,
      chainPreference: "Arc",
      destinationChainId: arcChainId,
      destinationWalletAddress: null,
      scheduleId: "s-1",
      timeTrackingMode: "schedule_based",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-7",
      companyId,
      walletAddress: "0x81c4bBaA91Da4F8f6C56F4f2dB8aB2C7F94e1234".toLowerCase(),
      name: "Grace Kim",
      role: "employee",
      payType: "daily",
      rateCents: 285_00,
      chainPreference: "Ethereum",
      destinationChainId: 11155111,
      destinationWalletAddress: null,
      scheduleId: "s-2",
      timeTrackingMode: "schedule_based",
      employmentStartDate: ytdStart,
      active: true,
    },
    {
      id: "r-8",
      companyId,
      walletAddress: "0x54eFA92AC4d3B70011b0563B86Ae2bC1506aF77C".toLowerCase(),
      name: "Hector Ruiz",
      role: "employee",
      payType: "hourly",
      rateCents: 38_00,
      chainPreference: "Base",
      destinationChainId: 8453,
      destinationWalletAddress: null,
      scheduleId: "s-2",
      timeTrackingMode: "check_in_out",
      employmentStartDate: ytdStart,
      active: true,
    },
  ];

  const timeEntries = [
    ...buildHourlyEntries("r-2", schedules[0], ytdStart, addDays(today, -1), holidays, 0),
    ...buildHourlyEntries("r-5", schedules[0], ytdStart, addDays(today, -1), holidays, 1),
    ...buildHourlyEntries("r-8", schedules[1], ytdStart, addDays(today, -1), holidays, 2),
  ].map<TimeEntryRecord>((entry) => ({
    ...entry,
    createdAt: `${entry.date}T${entry.clockIn}:00.000Z`,
  }));

  const payRuns: PayRunRecord[] = [];
  const payRunItems: PayRunItemRecord[] = [];
  const withdrawals: WithdrawalRecord[] = [];

  const treasuryBalances: TreasuryBalanceRecord[] = [
    { companyId, chainId: arcChainId, chainName: "Arc", usdcCents: 510_000_00, isHub: true },
    { companyId, chainId: 8453, chainName: "Base", usdcCents: 120_000_00, isHub: false },
    { companyId, chainId: 42161, chainName: "Arbitrum", usdcCents: 82_000_00, isHub: false },
    { companyId, chainId: 11155111, chainName: "Ethereum", usdcCents: 48_000_00, isHub: false },
  ];

  const policies: PolicyRecord[] = [
    {
      id: "policy-1",
      companyId,
      name: "Semimonthly Payroll",
      type: "payday",
      status: "active",
      config: { frequency: "semimonthly", executeAutomatically: false },
      lastRunAt: null,
    },
    {
      id: "policy-2",
      companyId,
      name: "Treasury Floor Alert",
      type: "treasury_threshold",
      status: "active",
      config: { minimumUsdc: 50_000, notifyOnly: true },
      lastRunAt: null,
    },
  ];

  return {
    company,
    treasuryBalances,
    employees,
    schedules,
    holidays,
    timeEntries,
    payRuns,
    payRunItems,
    policies,
    withdrawals,
  };
}

export function normalizeSeedChainId(chainPreference: string | null, arcChainId: number) {
  return chainIdFromPreference(chainPreference, arcChainId);
}
