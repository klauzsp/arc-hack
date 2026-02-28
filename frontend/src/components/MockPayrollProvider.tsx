"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type DashboardSummaryResponse, type EarningsResponse, type PolicyResponse, type TreasuryResponse, type WithdrawResponse } from "@/lib/api";
import type { PayRun, Recipient, Schedule, TimeEntry } from "@/lib/types";
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
type RecipientFormValues = Omit<Recipient, "id">;

type MockPayrollContextValue = {
  today: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  ytdStart: string;
  schedules: Schedule[];
  holidays: string[];
  recipients: Recipient[];
  payRuns: PayRun[];
  previewEmployeeId: string;
  activeSessions: Record<string, ActiveSession>;
  dashboard: DashboardSummaryResponse | null;
  treasury: TreasuryResponse | null;
  policies: PolicySummary[];
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
  createPayRun: () => Promise<PayRun>;
  approvePayRun: (payRunId: string) => Promise<PayRun>;
  executePayRun: (payRunId: string) => Promise<PayRun>;
  finalizePayRun: (payRunId: string) => Promise<PayRun>;
  clockIn: (recipientId: string, input?: { date?: string; clockIn?: string }) => Promise<void>;
  clockOut: (recipientId: string, input?: { clockOut?: string }) => Promise<void>;
  withdrawNow: (input?: { amount?: number }) => Promise<WithdrawResponse>;
  createPolicy: (input: { name: string; type: "payday" | "treasury_threshold" | "manual"; status?: "active" | "paused"; config?: Record<string, unknown> }) => Promise<PolicySummary>;
  updatePolicy: (policyId: string, input: Partial<{ name: string; type: "payday" | "treasury_threshold" | "manual"; status: "active" | "paused"; config: Record<string, unknown> }>) => Promise<PolicySummary>;
  updateAutoPolicy: (input: Partial<{ autoRebalanceEnabled: boolean; autoRedeemEnabled: boolean; rebalanceThreshold: number; payoutNoticeHours: number }>) => Promise<void>;
  rebalanceTreasury: (input: { direction: "usdc_to_usyc" | "usyc_to_usdc"; amount: number }) => Promise<string>;
};

const MockPayrollContext = createContext<MockPayrollContextValue | null>(null);

export function PayrollProvider({ children }: { children: React.ReactNode }) {
  const { token, role, employee } = useAuthSession();
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [treasury, setTreasury] = useState<TreasuryResponse | null>(null);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
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
      (recipient) => recipient.walletAddress.toLowerCase() === address.toLowerCase(),
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
      return;
    }

    const self = employee;
    if (!self) return;
    const [earnings, myEntries] = await Promise.all([
      api.getMyEarnings(authToken),
      api.getMyTimeEntries(authToken),
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
    <MockPayrollContext.Provider
      value={{
        today,
        currentPeriodStart: currentPeriodStart(today),
        currentPeriodEnd: currentPeriodEnd(today),
        ytdStart: yearStart(today),
        schedules,
        holidays,
        recipients,
        payRuns,
        previewEmployeeId,
        activeSessions,
        dashboard,
        treasury,
        policies,
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
        createPayRun,
        approvePayRun,
        executePayRun,
        finalizePayRun,
        clockIn,
        clockOut,
        withdrawNow,
        createPolicy,
        updatePolicy,
        updateAutoPolicy,
        rebalanceTreasury,
      }}
    >
      {children}
    </MockPayrollContext.Provider>
  );
}

export function usePayroll() {
  const context = useContext(MockPayrollContext);
  if (!context) {
    throw new Error("usePayroll must be used within PayrollProvider");
  }
  return context;
}

export const MockPayrollProvider = PayrollProvider;
export const useMockPayroll = usePayroll;
