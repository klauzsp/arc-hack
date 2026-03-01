import type { HolidayRecord, PayRun, Recipient, Schedule, TimeEntry, TimeOffAllowance, TimeOffPolicy, TimeOffRequest } from "./types";
import { publicConfig } from "./publicConfig";
import type { Role } from "./role";

const API_BASE_URL = publicConfig.apiUrl.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore JSON parsing failures
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export interface AuthChallengeResponse {
  address: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface AuthVerifyResponse {
  token: string | null;
  role: Role;
  employee: Recipient | null;
}

export interface InviteCodeResponse {
  code: string;
  invite: {
    id: string;
    employeeId: string;
    createdAt: string;
    expiresAt: string;
  };
  employee: Recipient;
}

export interface OnboardingRedeemResponse {
  employee: Recipient;
  invite: {
    id: string;
    createdAt: string;
    expiresAt: string;
  };
  options: {
    existingWallet: boolean;
    circleWallet: boolean;
  };
}

export interface CircleGoogleDeviceTokenResponse {
  circle: {
    appId: string;
    deviceToken: string;
    deviceEncryptionKey: string;
  };
}

export interface CircleOnboardingStartResponse {
  employee: Recipient;
  circle: {
    appId: string;
    deviceToken: string;
    deviceEncryptionKey: string;
  };
}

export interface CircleOnboardingPrepareResponse {
  employee: Recipient;
  circle: {
    challengeId: string | null;
    walletAddress: string | null;
  };
}

export interface OnboardingProfilePayload {
  chainPreference?: string | null;
}

export interface MeResponse {
  role: Role;
  employee: Recipient | null;
}

export interface CircleWalletTransferResponse {
  kind: "same_chain_transfer" | "cctp_approval" | "cctp_transfer";
  walletAddress: string;
  walletId: string;
  challengeId: string;
  blockchain: string;
  tokenAddress: string;
  symbol: string;
  sourceChain: string;
  destinationChain: string;
  destinationDomain: number;
  destinationAddress: string;
  approvalTargetAddress: string | null;
  amount: number;
  estimatedReceivedAmount: number;
  maxFee: number;
  transferSpeed: "instant" | "standard" | "fast";
}

export interface EarningsResponse {
  employee: Recipient;
  currentPeriod: {
    start: string;
    end: string;
    earned: number;
  };
  ytdEarned: number;
  alreadyPaid: number;
  availableToWithdraw: number;
  breakdown: {
    currentPeriodHours: number;
    ytdHours: number;
    currentPeriodDays: number;
    ytdDays: number;
    currentPeriodHolidayCount: number;
    ytdHolidayCount: number;
    scheduleHoursPerDay: number;
  };
}

export interface TreasuryResponse {
  totalUsdc: number;
  totalUsyc: number;
  chainBalances: Array<{
    chainId: number;
    chainName: string;
    usdcBalance: number;
    isHub: boolean;
  }>;
  autoPolicy: {
    autoRebalanceEnabled: boolean;
    autoRedeemEnabled: boolean;
    rebalanceThreshold: number;
    payoutNoticeHours: number;
  };
  source?: "db" | "chain";
  treasuryAddress?: string | null;
  controllerAddress?: string | null;
  usycCustodyAddress?: string | null;
  payRunAddress?: string | null;
  rebalanceAddress?: string | null;
  readError?: string | null;
}

export interface DashboardSummaryResponse {
  today: string;
  totalUsdc: number;
  totalUsyc: number;
  upcomingPayRun: {
    id: string;
    periodStart: string;
    periodEnd: string;
    totalAmount: number;
    status: PayRun["status"];
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

export interface PolicyResponse {
  id: string;
  name: string;
  type: string;
  status: "active" | "paused";
  config: Record<string, unknown>;
  lastRunAt: string | null;
}

export interface WithdrawResponse {
  ok: boolean;
  txHash: string;
  amount: number;
  walletAddress: string;
  chainPreference: string;
  destinationChainId: number;
  status: "paid" | "processing";
}

export interface TimeOffSummaryResponse {
  requests: TimeOffRequest[];
  allowance: TimeOffAllowance;
}

export interface AdminTimeOffResponse {
  policy: TimeOffPolicy;
  requests: TimeOffRequest[];
}

// ── Anomaly Detection Types ──────────────────────────────────────────────────

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyStatus = "detected" | "pending_review" | "rebalance_triggered" | "review_dismissed" | "confirmed";
export type AnomalyAction = "usyc_rebalance" | "ceo_manual_review";

export interface AnomalyFeatures {
  clockInHour: number;
  clockOutHour: number;
  durationHours: number;
  daysSincePayDay: number;
  daysUntilPayDay: number;
  occupationType: number;
  rateCents: number;
  dayOfWeek: number;
  isWeekend: boolean;
  scheduleDeviation: number;
}

export interface AnomalyRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  detectedAt: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  action: AnomalyAction;
  anomalyScore: number;
  reputationScore: number;
  features: AnomalyFeatures;
  reasons: string[];
  resolvedAt: string | null;
  resolvedBy: string | null;
  rebalanceTxHash: string | null;
}

export interface AnomalyDetectionResult {
  anomalies: AnomalyRecord[];
  scannedEntries: number;
  totalAnomalies: number;
  rebalanceTriggered: number;
  reviewTriggered: number;
}

export interface AnomalySummary {
  totalAnomalies: number;
  pendingReview: number;
  rebalancesTriggered: number;
  avgReputationScore: number;
  bySeverity: Record<AnomalySeverity, number>;
  recentAnomalies: AnomalyRecord[];
}

export interface ReputationRecord {
  employeeId: string;
  score: number;
  lastUpdated: string;
  anomalyCount: number;
  confirmedAnomalyCount: number;
}

export type RecipientPayload = {
  walletAddress?: string | null;
  name: string;
  payType: Recipient["payType"];
  rate: number;
  chainPreference?: string | null;
  destinationChainId?: number | null;
  destinationWalletAddress?: string | null;
  scheduleId?: string | null;
  timeTrackingMode?: Recipient["timeTrackingMode"];
  employmentStartDate?: string | null;
  active?: boolean;
};

export const api = {
  baseUrl: API_BASE_URL,
  health: () => request<{ ok: boolean; mode: string; stableFxConfigured?: boolean }>("/health"),
  createChallenge: (address: string) =>
    request<AuthChallengeResponse>("/auth/challenge", {
      method: "POST",
      body: { address },
    }),
  verifyChallenge: (input: { address: string; message: string; signature: `0x${string}` }) =>
    request<AuthVerifyResponse>("/auth/verify", {
      method: "POST",
      body: input,
    }),
  createCircleGoogleDeviceToken: (payload: { deviceId: string }) =>
    request<CircleGoogleDeviceTokenResponse>("/auth/circle/google/device-token", {
      method: "POST",
      body: payload,
    }),
  verifyCircleGoogle: (payload: { userToken: string }) =>
    request<AuthVerifyResponse>("/auth/circle/google/verify", {
      method: "POST",
      body: payload,
    }),
  getMe: (token: string) => request<MeResponse>("/me", { token }),
  createCircleWalletTransfer: (
    token: string,
    payload: { userToken: string; destinationAddress: string; amount: string; destinationPreference?: string },
  ) =>
    request<CircleWalletTransferResponse>("/me/circle/wallet/transfer", {
      method: "POST",
      token,
      body: payload,
    }),
  getDashboard: () => request<DashboardSummaryResponse>("/dashboard"),
  getRecipients: (token: string) => request<Recipient[]>("/recipients", { token }),
  createRecipient: (token: string, payload: RecipientPayload) =>
    request<Recipient>("/recipients", {
      method: "POST",
      token,
      body: payload,
    }),
  deleteRecipient: (token: string, id: string) =>
    request<{ ok: boolean }>(`/recipients/${id}`, {
      method: "DELETE",
      token,
    }),
  createRecipientAccessCode: (token: string, id: string) =>
    request<InviteCodeResponse>(`/recipients/${id}/access-code`, {
      method: "POST",
      token,
      body: {},
    }),
  updateRecipient: (token: string, id: string, payload: Partial<RecipientPayload>) =>
    request<Recipient>(`/recipients/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  redeemOnboardingCode: (code: string) =>
    request<OnboardingRedeemResponse>("/onboarding/redeem", {
      method: "POST",
      body: { code },
    }),
  createOnboardingWalletChallenge: (payload: { code: string; address: string }) =>
    request<AuthChallengeResponse>("/onboarding/wallet/challenge", {
      method: "POST",
      body: payload,
    }),
  claimOnboardingWallet: (payload: { code: string; address: string; message: string; signature: `0x${string}`; profile?: OnboardingProfilePayload }) =>
    request<AuthVerifyResponse>("/onboarding/wallet/claim", {
      method: "POST",
      body: payload,
    }),
  startCircleOnboarding: (payload: { code: string; deviceId: string; profile?: OnboardingProfilePayload }) =>
    request<CircleOnboardingStartResponse>("/onboarding/circle/start", {
      method: "POST",
      body: payload,
    }),
  prepareCircleOnboarding: (payload: { code: string; userToken: string; profile?: OnboardingProfilePayload }) =>
    request<CircleOnboardingPrepareResponse>("/onboarding/circle/prepare", {
      method: "POST",
      body: payload,
    }),
  completeCircleOnboarding: (payload: { code: string; userToken: string; profile?: OnboardingProfilePayload }) =>
    request<AuthVerifyResponse>("/onboarding/circle/complete", {
      method: "POST",
      body: payload,
    }),
  getSchedules: () => request<Schedule[]>("/schedules"),
  createSchedule: (token: string, payload: Omit<Schedule, "id">) =>
    request<Schedule>("/schedules", {
      method: "POST",
      token,
      body: payload,
    }),
  updateSchedule: (token: string, id: string, payload: Partial<Omit<Schedule, "id">>) =>
    request<Schedule>(`/schedules/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  deleteSchedule: (token: string, id: string) =>
    request<{ ok: true }>(`/schedules/${id}`, { method: "DELETE", token }),
  getHolidays: () => request<HolidayRecord[]>("/holidays"),
  createHoliday: (token: string, payload: { date: string; name: string }) =>
    request<HolidayRecord>("/holidays", {
      method: "POST",
      token,
      body: payload,
    }),
  updateHoliday: (token: string, id: string, payload: Partial<{ date: string; name: string }>) =>
    request<HolidayRecord>(`/holidays/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  deleteHoliday: (token: string, id: string) =>
    request<{ ok: true }>(`/holidays/${id}`, { method: "DELETE", token }),
  getMyEarnings: (token: string) => request<EarningsResponse>("/me/earnings", { token }),
  withdrawNow: (token: string, payload?: { amount?: number }) =>
    request<WithdrawResponse>("/me/withdraw", {
      method: "POST",
      token,
      body: payload ?? {},
    }),
  getEmployeeEarnings: (token: string, employeeId: string) =>
    request<EarningsResponse>(`/employees/${employeeId}/earnings`, { token }),
  getMyTimeEntries: (token: string) => request<Array<TimeEntry & { clockOut?: string | null }>>("/me/time-entries", { token }),
  getEmployeeTimeEntries: (token: string, employeeId: string) =>
    request<Array<TimeEntry & { clockOut?: string | null }>>(`/employees/${employeeId}/time-entries`, { token }),
  getMySchedule: (token: string) => request<Schedule>("/me/schedule", { token }),
  clockIn: (token: string, payload?: { date?: string; clockIn?: string }) =>
    request<TimeEntry & { clockOut?: string | null }>("/me/time-entries/clock-in", {
      method: "POST",
      token,
      body: payload ?? {},
    }),
  clockOut: (token: string, payload?: { clockOut?: string }) =>
    request<TimeEntry & { clockOut?: string | null }>("/me/time-entries/clock-out", {
      method: "POST",
      token,
      body: payload ?? {},
    }),
  getPayRuns: (token: string) => request<PayRun[]>("/pay-runs", { token }),
  getPayRun: (token: string, id: string) => request<PayRun>(`/pay-runs/${id}`, { token }),
  createPayRun: (token: string, payload: { periodStart: string; periodEnd: string; employeeIds?: string[] }) =>
    request<PayRun>("/pay-runs", {
      method: "POST",
      token,
      body: payload,
    }),
  updatePayRun: (token: string, id: string, payload: { periodStart?: string; periodEnd?: string; employeeIds?: string[] }) =>
    request<PayRun>(`/pay-runs/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  deletePayRun: (token: string, id: string) =>
    request<{ ok: boolean }>(`/pay-runs/${id}`, {
      method: "DELETE",
      token,
    }),
  approvePayRun: (token: string, id: string) =>
    request<PayRun>(`/pay-runs/${id}/approve`, {
      method: "POST",
      token,
      body: {},
    }),
  executePayRun: (token: string, id: string) =>
    request<PayRun>(`/pay-runs/${id}/execute`, {
      method: "POST",
      token,
      body: {},
    }),
  finalizePayRun: (token: string, id: string) =>
    request<PayRun>(`/pay-runs/${id}/finalize`, {
      method: "POST",
      token,
      body: {},
    }),
  getTreasury: () => request<TreasuryResponse>("/treasury/balances"),
  updateAutoPolicy: (
    token: string,
    payload: Partial<{
      autoRebalanceEnabled: boolean;
      autoRedeemEnabled: boolean;
      rebalanceThreshold: number;
      payoutNoticeHours: number;
    }>,
  ) =>
    request<TreasuryResponse["autoPolicy"]>("/treasury/auto-policy", {
      method: "POST",
      token,
      body: payload,
    }),
  rebalanceTreasury: (token: string, payload: { direction: "usdc_to_usyc" | "usyc_to_usdc"; amount: number }) =>
    request<{ txHash: string; treasury: TreasuryResponse }>("/treasury/rebalance", {
      method: "POST",
      token,
      body: payload,
    }),
  getPolicies: () => request<PolicyResponse[]>("/policies"),
  createPolicy: (
    token: string,
    payload: {
      name: string;
      type: "payday" | "treasury_threshold" | "manual";
      status?: "active" | "paused";
      config?: Record<string, unknown>;
    },
  ) =>
    request<PolicyResponse>("/policies", {
      method: "POST",
      token,
      body: payload,
    }),
  updatePolicy: (
    token: string,
    id: string,
    payload: Partial<{
      name: string;
      type: "payday" | "treasury_threshold" | "manual";
      status: "active" | "paused";
      config: Record<string, unknown>;
    }>,
  ) =>
    request<PolicyResponse>(`/policies/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  getTimeOffPolicy: (token: string) => request<TimeOffPolicy>("/time-off/policy", { token }),
  updateTimeOffPolicy: (token: string, payload: { maxDaysPerYear: number }) =>
    request<TimeOffPolicy>("/time-off/policy", {
      method: "PATCH",
      token,
      body: payload,
    }),
  getTimeOffRequests: (token: string) => request<AdminTimeOffResponse>("/time-off/requests", { token }),
  reviewTimeOffRequest: (token: string, id: string, payload: { status: "approved" | "rejected" | "cancelled" }) =>
    request<TimeOffRequest>(`/time-off/requests/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  reviewTimeOffRequestGroup: (token: string, groupId: string, payload: { status: "approved" | "rejected" }) =>
    request<TimeOffRequest[]>(`/time-off/requests/group/${groupId}`, {
      method: "PATCH",
      token,
      body: payload,
    }),
  getMyTimeOff: (token: string) => request<TimeOffSummaryResponse>("/me/time-off", { token }),
  createMyTimeOff: (token: string, payload: { date: string; note?: string | null; requestGroupId?: string | null }) =>
    request<TimeOffRequest>("/me/time-off", {
      method: "POST",
      token,
      body: payload,
    }),
  updateMyTimeOff: (
    token: string,
    id: string,
    payload: Partial<{ date: string; note: string | null; status: "cancelled" }>,
  ) =>
    request<TimeOffRequest>(`/me/time-off/${id}`, {
      method: "PATCH",
      token,
      body: payload,
    }),

  // ── Anomaly Detection ──────────────────────────────────────────────────────

  scanAnomalies: (token: string) =>
    request<AnomalyDetectionResult>("/anomalies/scan", {
      method: "POST",
      token,
      body: {},
    }),
  getAnomalies: (token: string, filter?: { employeeId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filter?.employeeId) params.set("employeeId", filter.employeeId);
    if (filter?.status) params.set("status", filter.status);
    const qs = params.toString();
    return request<AnomalyRecord[]>(`/anomalies${qs ? `?${qs}` : ""}`, { token });
  },
  getAnomalySummary: (token: string) =>
    request<AnomalySummary>("/anomalies/summary", { token }),
  resolveAnomaly: (token: string, id: string, resolution: "confirmed" | "review_dismissed") =>
    request<AnomalyRecord>(`/anomalies/${id}/resolve`, {
      method: "PATCH",
      token,
      body: { resolution },
    }),
  getReputations: (token: string) =>
    request<ReputationRecord[]>("/anomalies/reputations", { token }),
};
