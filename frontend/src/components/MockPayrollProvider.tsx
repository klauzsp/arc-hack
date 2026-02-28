"use client";

import { createContext, useContext, useState } from "react";
import type { PayRun, Recipient, TimeEntry } from "@/lib/mockTypes";
import {
  CURRENT_PERIOD_END,
  CURRENT_PERIOD_START,
  MOCK_TODAY,
  YTD_START,
  calculateRecipientMetrics,
  createNextPayRun,
  generateMockTxHash,
  getSuggestedClockInTime,
  getSuggestedClockOutTime,
  mockHolidays,
  mockSchedules,
  repriceUpcomingPayRuns,
  seedPayRuns,
  seedRecipients,
  seedTimeEntries,
} from "@/lib/mockPayrollEngine";

type RecipientFormValues = Omit<Recipient, "id">;
type ActiveSession = { date: string; clockIn: string };

type MockPayrollContextValue = {
  today: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  ytdStart: string;
  schedules: typeof mockSchedules;
  holidays: string[];
  recipients: Recipient[];
  payRuns: PayRun[];
  timeEntries: TimeEntry[];
  previewEmployeeId: string;
  activeSessions: Record<string, ActiveSession>;
  setPreviewEmployeeId: (recipientId: string) => void;
  getRecipientById: (recipientId: string) => Recipient | undefined;
  getRecipientByWallet: (address: string | undefined) => Recipient | undefined;
  getRecipientMetrics: (recipientId: string) => ReturnType<typeof calculateRecipientMetrics> | null;
  getRecipientTimeEntries: (recipientId: string) => TimeEntry[];
  addRecipient: (values: RecipientFormValues) => Recipient;
  updateRecipient: (recipientId: string, values: RecipientFormValues) => void;
  createPayRun: () => PayRun;
  executePayRun: (payRunId: string) => void;
  clockIn: (recipientId: string) => void;
  clockOut: (recipientId: string) => void;
};

const MockPayrollContext = createContext<MockPayrollContextValue | null>(null);

const DEFAULT_PREVIEW_EMPLOYEE_ID = "r-2";

export function MockPayrollProvider({ children }: { children: React.ReactNode }) {
  const [recipients, setRecipients] = useState<Recipient[]>(seedRecipients);
  const [payRuns, setPayRuns] = useState<PayRun[]>(seedPayRuns);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(seedTimeEntries);
  const [previewEmployeeId, setPreviewEmployeeId] = useState(DEFAULT_PREVIEW_EMPLOYEE_ID);
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveSession>>({});

  const getRecipientById = (recipientId: string) =>
    recipients.find((recipient) => recipient.id === recipientId);

  const getRecipientByWallet = (address: string | undefined) => {
    if (!address) return undefined;
    return recipients.find(
      (recipient) =>
        recipient.walletAddress.toLowerCase() === address.toLowerCase(),
    );
  };

  const getRecipientMetrics = (recipientId: string) => {
    const recipient = getRecipientById(recipientId);
    if (!recipient) return null;
    return calculateRecipientMetrics(
      recipient,
      payRuns,
      mockSchedules,
      mockHolidays,
      timeEntries,
    );
  };

  const getRecipientTimeEntries = (recipientId: string) =>
    timeEntries
      .filter((entry) => entry.recipientId === recipientId)
      .sort((left, right) =>
        `${left.date}${left.clockIn}`.localeCompare(`${right.date}${right.clockIn}`),
      );

  const addRecipient = (values: RecipientFormValues) => {
    const recipient = {
      ...values,
      id: `r-${recipients.length + 1}`,
    };
    const nextRecipients = [recipient, ...recipients];
    setRecipients(nextRecipients);
    setPayRuns(
      repriceUpcomingPayRuns(
        payRuns,
        nextRecipients,
        mockSchedules,
        mockHolidays,
        timeEntries,
      ),
    );
    return recipient;
  };

  const updateRecipient = (recipientId: string, values: RecipientFormValues) => {
    const nextRecipients = recipients.map((recipient) =>
      recipient.id === recipientId
        ? { ...recipient, ...values, id: recipientId }
        : recipient,
    );
    setRecipients(nextRecipients);
    setPayRuns(
      repriceUpcomingPayRuns(
        payRuns,
        nextRecipients,
        mockSchedules,
        mockHolidays,
        timeEntries,
      ),
    );
  };

  const createPayRun = () => {
    const nextPayRun = createNextPayRun(
      payRuns,
      recipients,
      mockSchedules,
      mockHolidays,
      timeEntries,
    );
    setPayRuns([...payRuns, nextPayRun]);
    return nextPayRun;
  };

  const executePayRun = (payRunId: string) => {
    setPayRuns(
      payRuns.map((payRun) =>
        payRun.id === payRunId
          ? {
              ...payRun,
              status: "executed",
              executedAt: `${MOCK_TODAY}T16:30:00Z`,
              txHash: generateMockTxHash(payRunId),
              items: (payRun.items ?? []).map((item) => ({
                ...item,
                status: "paid",
              })),
            }
          : payRun,
      ),
    );
  };

  const clockIn = (recipientId: string) => {
    if (activeSessions[recipientId]) return;
    setActiveSessions({
      ...activeSessions,
      [recipientId]: {
        date: MOCK_TODAY,
        clockIn: getSuggestedClockInTime(recipientId, timeEntries),
      },
    });
  };

  const clockOut = (recipientId: string) => {
    const session = activeSessions[recipientId];
    if (!session) return;

    const nextEntry = {
      id: `t-${timeEntries.length + 1}`,
      recipientId,
      date: session.date,
      clockIn: session.clockIn,
      clockOut: getSuggestedClockOutTime(recipientId, timeEntries, session.clockIn),
    };
    const nextTimeEntries = [...timeEntries, nextEntry];
    const nextSessions = { ...activeSessions };
    delete nextSessions[recipientId];

    setTimeEntries(nextTimeEntries);
    setActiveSessions(nextSessions);
    setPayRuns(
      repriceUpcomingPayRuns(
        payRuns,
        recipients,
        mockSchedules,
        mockHolidays,
        nextTimeEntries,
      ),
    );
  };

  return (
    <MockPayrollContext.Provider
      value={{
        today: MOCK_TODAY,
        currentPeriodStart: CURRENT_PERIOD_START,
        currentPeriodEnd: CURRENT_PERIOD_END,
        ytdStart: YTD_START,
        schedules: mockSchedules,
        holidays: mockHolidays,
        recipients,
        payRuns,
        timeEntries,
        previewEmployeeId,
        activeSessions,
        setPreviewEmployeeId,
        getRecipientById,
        getRecipientByWallet,
        getRecipientMetrics,
        getRecipientTimeEntries,
        addRecipient,
        updateRecipient,
        createPayRun,
        executePayRun,
        clockIn,
        clockOut,
      }}
    >
      {children}
    </MockPayrollContext.Provider>
  );
}

export function useMockPayroll() {
  const context = useContext(MockPayrollContext);
  if (!context) {
    throw new Error("useMockPayroll must be used within MockPayrollProvider");
  }
  return context;
}
