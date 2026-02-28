export type Role = "admin" | "employee" | null;
export type PayType = "yearly" | "daily" | "hourly";
export type TimeTrackingMode = "check_in_out" | "schedule_based";
export type PayRunStatus = "draft" | "approved" | "processing" | "executed" | "failed";
export type PolicyStatus = "active" | "paused";
export type PolicyType = "payday" | "treasury_threshold" | "manual";

export interface CompanyRecord {
  id: string;
  name: string;
  payFrequency: "semimonthly";
  defaultTimeTrackingMode: TimeTrackingMode;
  treasuryUsycCents: number;
  autoRebalanceEnabled: boolean;
  autoRedeemEnabled: boolean;
  rebalanceThresholdCents: number;
  payoutNoticeHours: number;
}

export interface TreasuryBalanceRecord {
  companyId: string;
  chainId: number;
  chainName: string;
  usdcCents: number;
  isHub: boolean;
}

export interface EmployeeRecord {
  id: string;
  companyId: string;
  walletAddress: string;
  name: string;
  role: "employee";
  payType: PayType;
  rateCents: number;
  chainPreference: string | null;
  destinationChainId: number | null;
  destinationWalletAddress: string | null;
  scheduleId: string | null;
  timeTrackingMode: TimeTrackingMode;
  active: boolean;
}

export interface ScheduleRecord {
  id: string;
  companyId: string;
  name: string;
  timezone: string;
  hoursPerDay: number;
  workingDays: number[];
}

export interface HolidayRecord {
  id: string;
  companyId: string;
  date: string;
  name: string;
}

export interface TimeEntryRecord {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  createdAt: string;
}

export interface PayRunRecord {
  id: string;
  companyId: string;
  onChainId: string | null;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  totalAmountCents: number;
  executedAt: string | null;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayRunItemRecord {
  id: string;
  payRunId: string;
  employeeId: string;
  recipientWalletAddress: string;
  destinationChainId: number;
  amountCents: number;
  status: string;
  txHash: string | null;
}

export interface PolicyRecord {
  id: string;
  companyId: string;
  name: string;
  type: PolicyType;
  status: PolicyStatus;
  config: Record<string, unknown>;
  lastRunAt: string | null;
}

export interface SessionRecord {
  token: string;
  address: string;
  role: Exclude<Role, null>;
  employeeId: string | null;
  expiresAt: string;
}

export interface AuthChallengeRecord {
  address: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface RecipientMetrics {
  currentPeriodEarnedCents: number;
  ytdEarnedCents: number;
  totalPaidCents: number;
  availableToWithdrawCents: number;
  currentPeriodHours: number;
  ytdHours: number;
  currentPeriodDays: number;
  ytdDays: number;
  currentPeriodHolidayCount: number;
  ytdHolidayCount: number;
  scheduleHoursPerDay: number;
}

export interface PayRunItemPreview {
  employeeId: string;
  recipientWalletAddress: string;
  destinationChainId: number;
  amountCents: number;
  status: string;
}

export interface DashboardSummary {
  today: string;
  totalUsdc: number;
  totalUsyc: number;
  upcomingPayRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    totalAmount: number;
    status: PayRunStatus;
  } | null;
  lastExecutedPayRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    totalAmount: number;
    executedAt: string | null;
  } | null;
  alerts: string[];
}
