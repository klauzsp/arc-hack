"use client";

import { useAccount } from "wagmi";
import { usePayroll } from "@/components/PayrollProvider";
import { useAuthSession } from "@/components/AuthProvider";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hoursWorked(clockIn: string, clockOut: string) {
  const [inHours, inMinutes] = clockIn.split(":").map(Number);
  const [outHours, outMinutes] = clockOut.split(":").map(Number);
  const minutes = outHours * 60 + outMinutes - (inHours * 60 + inMinutes);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function MyTimePage() {
  const { address } = useAccount();
  const { role } = useAuthSession();
  const {
    recipients,
    schedules,
    holidays,
    today,
    currentPeriodStart,
    previewEmployeeId,
    setPreviewEmployeeId,
    activeSessions,
    getRecipientByWallet,
    getRecipientById,
    getRecipientMetrics,
    getRecipientTimeEntries,
    clockIn,
    clockOut,
    loading,
    error,
  } = usePayroll();

  const connectedRecipient = getRecipientByWallet(address);
  const isAdmin = role === "admin";
  const recipient = connectedRecipient ?? getRecipientById(previewEmployeeId) ?? recipients[0];
  const metrics = recipient ? getRecipientMetrics(recipient.id) : null;
  const schedule = schedules.find((candidate) => candidate.id === recipient?.scheduleId) ?? schedules[0];
  const recipientEntries = recipient ? getRecipientTimeEntries(recipient.id) : [];
  const isCheckInOut = recipient?.timeTrackingMode === "check_in_out";
  const activeSession = recipient ? activeSessions[recipient.id] : undefined;
  const currentPeriodEntries = recipientEntries.filter(
    (entry) => entry.date >= currentPeriodStart && entry.date <= today,
  );
  const totalMinutes = currentPeriodEntries.reduce((total, entry) => {
    const [inHours, inMinutes] = entry.clockIn.split(":").map(Number);
    const [outHours, outMinutes] = entry.clockOut.split(":").map(Number);
    return total + (outHours * 60 + outMinutes - (inHours * 60 + inMinutes));
  }, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  if (loading && !metrics) {
    return <div className="text-sm text-slate-500">Loading time data…</div>;
  }

  if (!recipient || !metrics) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">{error ?? "Sign in as an employee or admin to view time tracking."}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {isCheckInOut
              ? "Track worked time with live clock-in and clock-out actions."
              : "Review the schedule and holiday calendar used to infer worked time."}
          </p>
          <p className="mt-1 text-xs text-slate-400">As of {formatDate(today)}</p>
        </div>
        {(isAdmin || !connectedRecipient) && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Preview employee</span>
            <select
              value={recipient.id}
              onChange={(event) => setPreviewEmployeeId(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {recipients.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isCheckInOut ? (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Today's Session</p>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(today)}</p>
                {activeSession && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Active since {activeSession.clockIn}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!activeSession}
                  onClick={() => void clockIn(recipient.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                  </svg>
                  Clock In
                </button>
                <button
                  type="button"
                  disabled={!activeSession}
                  onClick={() => void clockOut(recipient.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Clock Out
                </button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">This Period</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{totalHours} hrs</p>
              <p className="mt-0.5 text-xs text-slate-400">{currentPeriodEntries.length} entries logged</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Est. Earnings</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(metrics.currentPeriodEarned)}</p>
              <p className="mt-0.5 text-xs text-slate-400">@ {recipient.rate}/hr</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${activeSession ? "bg-emerald-500" : "bg-blue-500"}`} />
                <p className="text-sm font-semibold text-slate-900">
                  {activeSession ? "Clocked In" : "Ready"}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">Manual tracking enabled</p>
            </Card>
          </div>

          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Time Entries</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Clock In</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Clock Out</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Duration</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {currentPeriodEntries.slice().reverse().map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-900">{entry.date}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{entry.clockIn}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{entry.clockOut}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-medium text-slate-900">
                        {hoursWorked(entry.clockIn, entry.clockOut)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <Badge variant="success">Approved</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Schedule-Based Tracking</p>
                <p className="text-xs text-slate-500">Time is inferred from the assigned schedule. No manual check-in required.</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900">Working Days</h3>
              <p className="mt-1 text-xs text-slate-500">Schedule used for pay pro-rating</p>
              <div className="mt-4 flex gap-2">
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => {
                  const isWorkDay = schedule.workingDays.includes(index);
                  return (
                    <div
                      key={`${label}-${index}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                        isWorkDay ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {schedule.workingDays.map((day) => dayNames[day]).join(", ")} ({schedule.hoursPerDay} hrs/day)
              </p>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900">Pro-rating Inputs</h3>
              <p className="mt-1 text-xs text-slate-500">Values used for current earnings calculations</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Current period</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{metrics.currentPeriodDays} working days</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Schedule hours</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{(metrics.currentPeriodDays * schedule.hoursPerDay).toFixed(1)} scheduled hours</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Holiday exclusions</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{metrics.currentPeriodHolidayCount} holiday(s) in this period</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900">Holiday Calendar</h3>
            <p className="mt-1 text-xs text-slate-500">Excluded from schedule-based days worked</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {holidays.map((holiday) => {
                const holidayDate = new Date(`${holiday}T12:00:00Z`);
                const isPast = holidayDate <= new Date(`${today}T12:00:00Z`);
                return (
                  <div key={holiday} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${isPast ? "bg-slate-300" : "bg-amber-400"}`} />
                      <span className={`text-sm ${isPast ? "text-slate-500" : "text-slate-700"}`}>
                        {holidayDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    {isPast ? <Badge>Past</Badge> : <Badge variant="warning">Upcoming</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
