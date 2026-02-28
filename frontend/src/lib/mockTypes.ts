/** Types aligned with backend API for drop-in swap when integrated */

export type PayType = "yearly" | "daily" | "hourly";
export type TimeTrackingMode = "check_in_out" | "schedule_based";
export type PayRunStatus = "draft" | "pending" | "approved" | "processing" | "executed" | "failed";

export interface Schedule {
  id: string;
  name?: string;
  workingDays: number[]; // 0-6
  hoursPerDay: number;
  timezone?: string;
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
  walletAddress: string;
  name: string;
  payType: PayType;
  rate: number; // in dollars (or cents per backend)
  chainPreference?: string;
  destinationChainId?: number | null;
  destinationWalletAddress?: string | null;
  scheduleId?: string;
  timeTrackingMode: TimeTrackingMode;
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

export interface Employee {
  id: string;
  walletAddress: string;
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
