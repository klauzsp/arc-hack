"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type AdminTimeOffResponse, type DashboardSummaryResponse, type EarningsResponse, type InviteCodeResponse, type PolicyResponse, type TimeOffSummaryResponse, type TreasuryResponse, type WithdrawResponse } from "@/lib/api";
import type { HolidayRecord, PayRun, Recipient, Schedule, TimeEntry, TimeOffAllowance, TimeOffPolicy, TimeOffRequest } from "@/lib/types";
import { currentPeriodEnd, currentPeriodStart, yearStart } from "@/lib/payPeriods";
import { useAuthSession } from "./AuthProvider";

type RecipientMetrics = EarningsResponse["breakdown"] & {
  currentPeriodEarned: number;
  ytdEarned: number;
  totalPaid: number;
  availableToWithdraw: number;
};

type ActiveSession = { date: string; clockIn: string };
type PolicySummary = PolicyResponse;
type RecipientFormValues = {
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

type PayrollContextValue = {
  today: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  ytdStart: string;
  schedules: Schedule[];
  holidayRecords: HolidayRecord[];
  holidays: string[];
  recipients: Recipient[];
  payRuns: PayRun[];
  previewEmployeeId: string;
  activeSessions: Record<string, ActiveSession>;
  dashboard: DashboardSummaryResponse | null;
  treasury: TreasuryResponse | null;
  policies: PolicySummary[];
  timeOffPolicy: TimeOffPolicy | null;
  myTimeOffRequests: TimeOffRequest[];
  myTimeOffAllowance: TimeOffAllowance | null;
  adminTimeOffRequests: TimeOffRequest[];
  loading: boolean;
  error: string | null;
  setPreviewEmployeeId: (recipientId: string) => void;
  refresh: () => Promise<void>;
  getRecipientById: (recipientId: string) => Recipient | undefined;
  getRecipientByWallet: (address: string | undefined) => Recipient | undefined;
  getRecipientMetrics: (recipientId: string) => RecipientMetrics | null;
  getRecipientTimeEntries: (recipientId: string) => TimeEntry[];
  addRecipient: (values: RecipientFormValues) => Promise<Recipient>;
  updateRecipient: (recipientId: string, values: Partial<RecipientFormValues>) => Promise<Recipient>;
  deleteRecipient: (recipientId: string) => Promise<void>;
  createRecipientAccessCode: (recipientId: string) => Promise<InviteCodeResponse>;
  createSchedule: (values: Omit<Schedule, "id">) => Promise<Schedule>;
  updateSchedule: (scheduleId: string, values: Partial<Omit<Schedule, "id">>) => Promise<Schedule>;
  deleteSchedule: (scheduleId: string) => Promise<void>;
  createHoliday: (values: { date: string; name: string }) => Promise<HolidayRecord>;
  updateHoliday: (holidayId: string, values: Partial<{ date: string; name: string }>) => Promise<HolidayRecord>;
  createPayRun: () => Promise<PayRun>;
  createPayRunForPeriod: (periodStart: string, periodEnd: string) => Promise<PayRun>;
  deletePayRun: (payRunId: string) => Promise<void>;
  approvePayRun: (payRunId: string) => Promise<PayRun>;
  executePayRun: (payRunId: string) => Promise<PayRun>;
  finalizePayRun: (payRunId: string) => Promise<PayRun>;
  clockIn: (recipientId: string, input?: { date?: string; clockIn?: string }) => Promise<void>;
  clockOut: (recipientId: string, input?: { clockOut?: string }) => Promise<void>;
  withdrawNow: (input?: { amount?: number }) => Promise<WithdrawResponse>;
  createMyTimeOff: (input: { date: string; note?: string | null; requestGroupId?: string | null }) => Promise<TimeOffRequest>;
  updateMyTimeOff: (id: string, input: Partial<{ date: string; note: string | null; status: "cancelled" }>) => Promise<TimeOffRequest>;
  reviewTimeOffRequest: (id: string, input: { status: "approved" | "rejected" | "cancelled" }) => Promise<TimeOffRequest>;
  reviewTimeOffRequestGroup: (groupId: string, input: { status: "approved" | "rejected" }) => Promise<TimeOffRequest[]>;
  updateTimeOffPolicy: (input: { maxDaysPerYear: number }) => Promise<TimeOffPolicy>;
  createPolicy: (input: { name: string; type: "payday" | "treasury_threshold" | "manual"; status?: "active" | "paused"; config?: Record<string, unknown> }) => Promise<PolicySummary>;
  updatePolicy: (policyId: string, input: Partial<{ name: string; type: "payday" | "treasury_threshold" | "manual"; status: "active" | "paused"; config: Record<string, unknown> }>) => Promise<PolicySummary>;
  updateAutoPolicy: (input: Partial<{ autoRebalanceEnabled: boolean; autoRedeemEnabled: boolean; rebalanceThreshold: number; payoutNoticeHours: number }>) => Promise<void>;
  rebalanceTreasury: (input: { direction: "usdc_to_usyc" | "usyc_to_usdc"; amount: number }) => Promise<string>;
};

const PayrollContext = createContext<PayrollContextValue | null>(null);

export function PayrollProvider({ children }: { children: React.ReactNode }) {
  const { token, role, employee } = useAuthSession();
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [treasury, setTreasury] = useState<TreasuryResponse | null>(null);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidayRecords, setHolidayRecords] = useState<HolidayRecord[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
  const [timeOffPolicy, setTimeOffPolicy] = useState<TimeOffPolicy | null>(null);
  const [myTimeOffRequests, setMyTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [myTimeOffAllowance, setMyTimeOffAllowance] = useState<TimeOffAllowance | null>(null);
  const [adminTimeOffRequests, setAdminTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [earningsByRecipientId, setEarningsByRecipientId] = useState<Record<string, EarningsResponse>>({});
  const [timeEntriesByRecipientId, setTimeEntriesByRecipientId] = useState<Record<string, TimeEntry[]>>({});
  const [previewEmployeeId, setPreviewEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = dashboard?.today ?? new Date().toISOString().slice(0, 10);

  const activeSessions = useMemo(() => {
    return Object.fromEntries(
      Object.entries(timeEntriesByRecipientId)
        .map(([recipientId, entries]) => {
          const open = [...entries]
            .filter((entry) => !entry.clockOut)
            .sort((left, right) => `${right.date}${right.clockIn}`.localeCompare(`${left.date}${left.clockIn}`))[0];
          return open ? [recipientId, { date: open.date, clockIn: open.clockIn }] : null;
        })
        .filter(Boolean) as Array<[string, ActiveSession]>,
    );
  }, [timeEntriesByRecipientId]);

  const getRecipientById = (recipientId: string) =>
    recipients.find((recipient) => recipient.id === recipientId);

  const getRecipientByWallet = (address: string | undefined) => {
    if (!address) return undefined;
    return recipients.find(
      (recipient) => recipient.walletAddress?.toLowerCase() === address.toLowerCase(),
    );
  };

  const getRecipientMetrics = (recipientId: string) => {
    const earnings = earningsByRecipientId[recipientId];
    if (!earnings) return null;
    return {
      ...earnings.breakdown,
      currentPeriodEarned: earnings.currentPeriod.earned,
      ytdEarned: earnings.ytdEarned,
      totalPaid: earnings.alreadyPaid,
      availableToWithdraw: earnings.availableToWithdraw,
    };
  };

  const getRecipientTimeEntries = (recipientId: string) =>
    (timeEntriesByRecipientId[recipientId] ?? []).map((entry) => ({
      id: entry.id,
      recipientId,
      date: entry.date,
      clockIn: entry.clockIn,
      clockOut: entry.clockOut ?? "",
    }));

  const hydrateEmployeeData = async (recipientList: Recipient[], authToken: string | null, currentRole: typeof role) => {
    if (!authToken || (currentRole !== "admin" && currentRole !== "employee")) {
      setEarningsByRecipientId({});
      setTimeEntriesByRecipientId({});
      setTimeOffPolicy(null);
      setMyTimeOffRequests([]);
      setMyTimeOffAllowance(null);
      setAdminTimeOffRequests([]);
      return;
    }

    if (currentRole === "admin") {
      const earningsEntries = await Promise.all(
        recipientList.map(async (recipient) => {
          const earnings = await api.getEmployeeEarnings(authToken, recipient.id);
          return [recipient.id, earnings] as const;
        }),
      );
      const timeEntries = await Promise.all(
        recipientList.map(async (recipient) => {
          const entries = await api.getEmployeeTimeEntries(authToken, recipient.id);
          return [recipient.id, entries.map((entry) => ({
            id: entry.id,
            recipientId: recipient.id,
            date: entry.date,
            clockIn: entry.clockIn,
            clockOut: entry.clockOut ?? "",
          }))] as const;
        }),
      );
      setEarningsByRecipientId(Object.fromEntries(earningsEntries));
      setTimeEntriesByRecipientId(Object.fromEntries(timeEntries));
      setMyTimeOffRequests([]);
      setMyTimeOffAllowance(null);
      const timeOff = await api.getTimeOffRequests(authToken);
      setTimeOffPolicy(timeOff.policy);
      setAdminTimeOffRequests(timeOff.requests);
      return;
    }

    const self = employee;
    if (!self) return;
    const [earnings, myEntries, myTimeOff, policy] = await Promise.all([
      api.getMyEarnings(authToken),
      api.getMyTimeEntries(authToken),
      api.getMyTimeOff(authToken),
      api.getTimeOffPolicy(authToken),
    ]);
    setEarningsByRecipientId({ [self.id]: earnings });
    setTimeEntriesByRecipientId({
      [self.id]: myEntries.map((entry) => ({
        id: entry.id,
        recipientId: self.id,
        date: entry.date,
        clockIn: entry.clockIn,
        clockOut: entry.clockOut ?? "",
      })),
    });
    setMyTimeOffRequests(myTimeOff.requests);
    setMyTimeOffAllowance(myTimeOff.allowance);
    setTimeOffPolicy(policy);
    setAdminTimeOffRequests([]);
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, treasuryResponse, schedulesResponse, holidaysResponse, policiesResponse] = await Promise.all([
        api.getDashboard(),
        api.getTreasury(),
        api.getSchedules(),
        api.getHolidays(),
        api.getPolicies(),
      ]);

      let recipientsResponse: Recipient[] = [];
      let payRunsResponse: PayRun[] = [];
      if (token && role === "admin") {
        [recipientsResponse, payRunsResponse] = await Promise.all([
          api.getRecipients(token),
          api.getPayRuns(token),
        ]);
      } else if (employee) {
        recipientsResponse = [employee];
      }

      setDashboard(dashboardResponse);
      setTreasury(treasuryResponse);
      setSchedules(schedulesResponse);
      setHolidayRecords(holidaysResponse);
      setHolidays(holidaysResponse.map((holiday) => holiday.date));
      setPolicies(policiesResponse);
      setRecipients(recipientsResponse);
      setPayRuns(payRunsResponse);
      setPreviewEmployeeId((current) =>
        recipientsResponse.some((recipient) => recipient.id === current)
          ? current
          : employee?.id || recipientsResponse[0]?.id || "",
      );

      await hydrateEmployeeData(recipientsResponse, token, role);
    } catch (refreshError) {
      if (refreshError instanceof Error) {
        setError(refreshError.message);
      } else {
        setError("Failed to load payroll data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, role, employee?.id]);

  const addRecipient = async (values: RecipientFormValues) => {
    if (!token) throw new Error("Admin session required.");
    const created = await api.createRecipient(token, values);
    await refresh();
    return created;
  };

  const updateRecipient = async (recipientId: string, values: Partial<RecipientFormValues>) => {
    if (!token) throw new Error("Admin session required.");
    const updated = await api.updateRecipient(token, recipientId, values);
    await refresh();
    return updated;
  };

  const deleteRecipient = async (recipientId: string) => {
    if (!token) throw new Error("Admin session required.");
    await api.deleteRecipient(token, recipientId);
    await refresh();
  };

  const createRecipientAccessCode = async (recipientId: string) => {
    if (!token) throw new Error("Admin session required.");
    const invite = await api.createRecipientAccessCode(token, recipientId);
    await refresh();
    return invite;
  };

  const createSchedule = async (values: Omit<Schedule, "id">) => {
    if (!token) throw new Error("Admin session required.");
    const created = await api.createSchedule(token, values);
    await refresh();
    return created;
  };

  const updateSchedule = async (scheduleId: string, values: Partial<Omit<Schedule, "id">>) => {
    if (!token) throw new Error("Admin session required.");
    const updated = await api.updateSchedule(token, scheduleId, values);
    await refresh();
    return updated;
  };

  const deleteSchedule = async (scheduleId: string) => {
    if (!token) throw new Error("Admin session required.");
    await api.deleteSchedule(token, scheduleId);
    await refresh();
  };

  const createHoliday = async (values: { date: string; name: string }) => {
    if (!token) throw new Error("Admin session required.");
    const created = await api.createHoliday(token, values);
    await refresh();
    return created;
  };

  const updateHoliday = async (holidayId: string, values: Partial<{ date: string; name: string }>) => {
    if (!token) throw new Error("Admin session required.");
    const updated = await api.updateHoliday(token, holidayId, values);
    await refresh();
    return updated;
  };

  const createPayRun = async () => {
    if (!token) throw new Error("Admin session required.");
    const latest = payRuns[0];
    const nextPeriodStartIso = latest
      ? (() => {
          const nextStart = new Date(`${latest.periodEnd}T12:00:00Z`);
          nextStart.setUTCDate(nextStart.getUTCDate() + 1);
          return nextStart.toISOString().slice(0, 10);
        })()
      : currentPeriodStart(today);
    const created = await api.createPayRun(token, {
      periodStart: nextPeriodStartIso,
      periodEnd: currentPeriodEnd(nextPeriodStartIso),
    });
    await refresh();
    return created;
  };

  const createPayRunForPeriod = async (periodStart: string, periodEnd: string) => {
    if (!token) throw new Error("Admin session required.");
    const created = await api.createPayRun(token, { periodStart, periodEnd });
    await refresh();
    return created;
  };

  const deletePayRun = async (payRunId: string) => {
    if (!token) throw new Error("Admin session required.");
    await api.deletePayRun(token, payRunId);
  };

  const approvePayRun = async (payRunId: string) => {
    if (!token) throw new Error("Admin session required.");
    const payRun = await api.approvePayRun(token, payRunId);
    await refresh();
    return payRun;
  };

  const executePayRun = async (payRunId: string) => {
    if (!token) throw new Error("Admin session required.");
    const payRun = await api.executePayRun(token, payRunId);
    await refresh();
    return payRun;
  };

  const finalizePayRun = async (payRunId: string) => {
    if (!token) throw new Error("Admin session required.");
    const payRun = await api.finalizePayRun(token, payRunId);
    await refresh();
    return payRun;
  };

  const clockIn = async (recipientId: string, input?: { date?: string; clockIn?: string }) => {
    if (!token || role !== "employee" || employee?.id !== recipientId) {
      throw new Error("Only the signed-in employee can clock in.");
    }
    await api.clockIn(token, input);
    await refresh();
  };

  const clockOut = async (recipientId: string, input?: { clockOut?: string }) => {
    if (!token || role !== "employee" || employee?.id !== recipientId) {
      throw new Error("Only the signed-in employee can clock out.");
    }
    await api.clockOut(token, input);
    await refresh();
  };

  const withdrawNow = async (input?: { amount?: number }) => {
    if (!token || role !== "employee" || !employee) {
      throw new Error("Only the signed-in employee can withdraw earnings.");
    }
    const response = await api.withdrawNow(token, input);
    await refresh();
    return response;
  };

  const createMyTimeOff = async (input: { date: string; note?: string | null }) => {
    if (!token || role !== "employee") {
      throw new Error("Employee session required.");
    }
    const request = await api.createMyTimeOff(token, input);
    await refresh();
    return request;
  };

  const updateMyTimeOff = async (
    id: string,
    input: Partial<{ date: string; note: string | null; status: "cancelled" }>,
  ) => {
    if (!token || role !== "employee") {
      throw new Error("Employee session required.");
    }
    const request = await api.updateMyTimeOff(token, id, input);
    await refresh();
    return request;
  };

  const reviewTimeOffRequest = async (
    id: string,
    input: { status: "approved" | "rejected" | "cancelled" },
  ) => {
    if (!token) throw new Error("Admin session required.");
    const request = await api.reviewTimeOffRequest(token, id, input);
    await refresh();
    return request;
  };

  const reviewTimeOffRequestGroup = async (
    groupId: string,
    input: { status: "approved" | "rejected" },
  ) => {
    if (!token) throw new Error("Admin session required.");
    const requests = await api.reviewTimeOffRequestGroup(token, groupId, input);
    await refresh();
    return requests;
  };

  const updateTimeOffPolicy = async (input: { maxDaysPerYear: number }) => {
    if (!token) throw new Error("Admin session required.");
    const policy = await api.updateTimeOffPolicy(token, input);
    await refresh();
    return policy;
  };

  const createPolicy = async (input: {
    name: string;
    type: "payday" | "treasury_threshold" | "manual";
    status?: "active" | "paused";
    config?: Record<string, unknown>;
  }) => {
    if (!token) throw new Error("Admin session required.");
    const policy = await api.createPolicy(token, input);
    await refresh();
    return policy;
  };

  const updatePolicy = async (policyId: string, input: Partial<{ name: string; type: "payday" | "treasury_threshold" | "manual"; status: "active" | "paused"; config: Record<string, unknown> }>) => {
    if (!token) throw new Error("Admin session required.");
    const policy = await api.updatePolicy(token, policyId, input);
    await refresh();
    return policy;
  };

  const updateAutoPolicy = async (input: Partial<{ autoRebalanceEnabled: boolean; autoRedeemEnabled: boolean; rebalanceThreshold: number; payoutNoticeHours: number }>) => {
    if (!token) throw new Error("Admin session required.");
    await api.updateAutoPolicy(token, input);
    await refresh();
  };

  const rebalanceTreasury = async (input: { direction: "usdc_to_usyc" | "usyc_to_usdc"; amount: number }) => {
    if (!token) throw new Error("Admin session required.");
    const response = await api.rebalanceTreasury(token, input);
    await refresh();
    return response.txHash;
  };

  return (
    <PayrollContext.Provider
      value={{
        today,
        currentPeriodStart: currentPeriodStart(today),
        currentPeriodEnd: currentPeriodEnd(today),
        ytdStart: yearStart(today),
        schedules,
        holidayRecords,
        holidays,
        recipients,
        payRuns,
        previewEmployeeId,
        activeSessions,
        dashboard,
        treasury,
        policies,
        timeOffPolicy,
        myTimeOffRequests,
        myTimeOffAllowance,
        adminTimeOffRequests,
        loading,
        error,
        setPreviewEmployeeId,
        refresh,
        getRecipientById,
        getRecipientByWallet,
        getRecipientMetrics,
        getRecipientTimeEntries,
        addRecipient,
        updateRecipient,
        deleteRecipient,
        createRecipientAccessCode,
        createSchedule,
        updateSchedule,
        deleteSchedule,
        createHoliday,
        updateHoliday,
        createPayRun,
        createPayRunForPeriod,
        deletePayRun,
        approvePayRun,
        executePayRun,
        finalizePayRun,
        clockIn,
        clockOut,
        withdrawNow,
        createMyTimeOff,
        updateMyTimeOff,
        reviewTimeOffRequest,
        reviewTimeOffRequestGroup,
        updateTimeOffPolicy,
        createPolicy,
        updatePolicy,
        updateAutoPolicy,
        rebalanceTreasury,
      }}
    >
      {children}
    </PayrollContext.Provider>
  );
}

export function usePayroll() {
  const context = useContext(PayrollContext);
  if (!context) {
    throw new Error("usePayroll must be used within PayrollProvider");
  }
  return context;
}
