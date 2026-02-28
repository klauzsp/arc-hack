/** Types aligned with backend API for drop-in swap when integrated */

export type PayType = "yearly" | "daily" | "hourly";
export type TimeTrackingMode = "check_in_out" | "schedule_based";
export type PayRunStatus = "draft" | "pending" | "approved" | "processing" | "executed" | "failed";
export type OnboardingStatus = "unclaimed" | "claimed";
export type OnboardingMethod = "existing_wallet" | "circle" | null;

export interface ActiveInvite {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface Schedule {
  id: string;
  name?: string;
  workingDays: number[]; // 0-6
  hoursPerDay: number;
  timezone?: string;
  startTime?: string;
}

export interface TimeEntry {
  id: string;
  recipientId: string;
  date: string; // ISO date
  clockIn: string; // ISO time
  clockOut: string;
}

export interface Recipient {
  id: string;
  walletAddress: string | null;
  name: string;
  payType: PayType;
  rate: number; // in dollars (or cents per backend)
  chainPreference?: string;
  destinationChainId?: number | null;
  destinationWalletAddress?: string | null;
  scheduleId?: string;
  timeTrackingMode: TimeTrackingMode;
  employmentStartDate?: string | null;
  onboardingStatus: OnboardingStatus;
  onboardingMethod: OnboardingMethod;
  claimedAt?: string | null;
  activeInvite?: ActiveInvite | null;
  availableToWithdraw?: number;
  active?: boolean;
}

export interface PayRunItem {
  recipientId: string;
  amount: number;
  chainId?: number;
  status?: string;
}

export interface PayRun {
  id: string;
  onChainId?: string | null;
  periodStart: string;
  periodEnd: string;
  status: PayRunStatus;
  totalAmount: number;
  recipientCount: number;
  items?: PayRunItem[];
  txHash?: string;
  executedAt?: string;
}

export interface ChainBalance {
  chainId: number;
  chainName: string;
  usdcBalance: number;
}

export interface HolidayRecord {
  id: string;
  date: string;
  name: string;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  date: string;
  note?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
}

export interface TimeOffAllowance {
  yearStart: string;
  yearEnd: string;
  maxDays: number;
  approvedDays: number;
  reservedDays: number;
  remainingDays: number;
}

export interface TimeOffPolicy {
  maxDaysPerYear: number;
  yearStartMonth: number;
  yearStartDay: number;
}

export interface Employee {
  id: string;
  walletAddress: string | null;
  name: string;
  payType: PayType;
  rate: number;
  chainPreference?: string;
  scheduleId?: string;
  timeTrackingMode: TimeTrackingMode;
  totalPaid: number; // already paid out
  earnedToDate: number; // pro-rated
  availableToWithdraw: number;
}
