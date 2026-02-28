"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePayroll } from "@/components/PayrollProvider";
import { useAuthSession } from "@/components/AuthProvider";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addHours(clock: string, hours: number) {
  const [baseHours, baseMinutes] = clock.split(":").map(Number);
  const totalMinutes = baseHours * 60 + baseMinutes + Math.round(hours * 60);
  const nextHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}

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

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default function MyTimePage() {
  const { address } = useAccount();
  const { role, employee } = useAuthSession();
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
    myTimeOffRequests,
    myTimeOffAllowance,
    createMyTimeOff,
    updateMyTimeOff,
    loading,
    error,
  } = usePayroll();
  const [clockInTime, setClockInTime] = useState("09:00");
  const [clockOutTime, setClockOutTime] = useState("17:00");
  const [timeMessage, setTimeMessage] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<"clock_in" | "clock_out" | null>(null);
  const [timeOffDate, setTimeOffDate] = useState(today);
  const [timeOffNote, setTimeOffNote] = useState("");
  const [editingTimeOffId, setEditingTimeOffId] = useState<string | null>(null);
  const [timeOffMessage, setTimeOffMessage] = useState<string | null>(null);
  const [timeOffError, setTimeOffError] = useState<string | null>(null);
  const [isSavingTimeOff, setIsSavingTimeOff] = useState(false);

  const connectedRecipient = getRecipientByWallet(address);
  const sessionRecipient = employee ? getRecipientById(employee.id) ?? employee : null;
  const isAdmin = role === "admin";
  const ownRecipient = sessionRecipient ?? connectedRecipient ?? null;
  const recipient = isAdmin
    ? getRecipientById(previewEmployeeId) ?? recipients[0]
    : ownRecipient;
  const metrics = recipient ? getRecipientMetrics(recipient.id) : null;
  const schedule = schedules.find((candidate) => candidate.id === recipient?.scheduleId) ?? schedules[0];
  const recipientEntries = recipient ? getRecipientTimeEntries(recipient.id) : [];
  const isCheckInOut = recipient?.timeTrackingMode === "check_in_out";
  const activeSession = recipient ? activeSessions[recipient.id] : undefined;
  const canManageOwnTime = role === "employee" && ownRecipient?.id === recipient?.id;
  const currentPeriodEntries = recipientEntries.filter(
    (entry) => entry.date >= currentPeriodStart && entry.date <= today,
  );
  const totalMinutes = currentPeriodEntries.reduce((total, entry) => {
    if (!entry.clockOut) return total;
    const [inHours, inMinutes] = entry.clockIn.split(":").map(Number);
    const [outHours, outMinutes] = entry.clockOut.split(":").map(Number);
    return total + (outHours * 60 + outMinutes - (inHours * 60 + inMinutes));
  }, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  useEffect(() => {
    if (!recipient) return;
    setTimeMessage(null);
    setTimeError(null);
    setClockInTime(activeSession?.clockIn ?? "09:00");
    setClockOutTime(activeSession ? addHours(activeSession.clockIn, schedule.hoursPerDay || 8) : "17:00");
  }, [recipient?.id, activeSession?.clockIn, schedule.hoursPerDay]);

  useEffect(() => {
    if (!editingTimeOffId) {
      setTimeOffDate(today);
      setTimeOffNote("");
    }
  }, [today, editingTimeOffId]);

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

  const handleClockIn = async () => {
    setTimeMessage(null);
    setTimeError(null);
    setIsSubmitting("clock_in");
    try {
      await clockIn(recipient.id, { clockIn: clockInTime });
      setTimeMessage(`Clocked in at ${clockInTime}.`);
    } catch (clockActionError) {
      setTimeError(clockActionError instanceof Error ? clockActionError.message : "Clock-in failed.");
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleClockOut = async () => {
    setTimeMessage(null);
    setTimeError(null);
    setIsSubmitting("clock_out");
    try {
      await clockOut(recipient.id, { clockOut: clockOutTime });
      setTimeMessage(`Clocked out at ${clockOutTime}.`);
    } catch (clockActionError) {
      setTimeError(clockActionError instanceof Error ? clockActionError.message : "Clock-out failed.");
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleSaveTimeOff = async () => {
    setTimeOffMessage(null);
    setTimeOffError(null);
    setIsSavingTimeOff(true);
    try {
      if (editingTimeOffId) {
        await updateMyTimeOff(editingTimeOffId, { date: timeOffDate, note: timeOffNote || null });
        setTimeOffMessage("Time-off request updated.");
      } else {
        await createMyTimeOff({ date: timeOffDate, note: timeOffNote || null });
        setTimeOffMessage("Time-off request submitted for approval.");
      }
      setEditingTimeOffId(null);
      setTimeOffDate(today);
      setTimeOffNote("");
    } catch (timeOffActionError) {
      setTimeOffError(timeOffActionError instanceof Error ? timeOffActionError.message : "Failed to save day off.");
    } finally {
      setIsSavingTimeOff(false);
    }
  };

  const handleCancelTimeOff = async (id: string) => {
    setTimeOffMessage(null);
    setTimeOffError(null);
    setIsSavingTimeOff(true);
    try {
      await updateMyTimeOff(id, { status: "cancelled" });
      if (editingTimeOffId === id) {
        setEditingTimeOffId(null);
        setTimeOffDate(today);
        setTimeOffNote("");
      }
      setTimeOffMessage("Time-off request cancelled.");
    } catch (timeOffActionError) {
      setTimeOffError(timeOffActionError instanceof Error ? timeOffActionError.message : "Failed to cancel day off.");
    } finally {
      setIsSavingTimeOff(false);
    }
  };

  const beginEditTimeOff = (id: string) => {
    const current = myTimeOffRequests.find((request) => request.id === id);
    if (!current) return;
    setEditingTimeOffId(id);
    setTimeOffDate(current.date);
    setTimeOffNote(current.note ?? "");
    setTimeOffMessage(null);
    setTimeOffError(null);
  };

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
        {isAdmin && (
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

      {timeMessage && (
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-emerald-800">{timeMessage}</p>
        </Card>
      )}

      {timeError && (
        <Card className="border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">{timeError}</p>
        </Card>
      )}

      {isCheckInOut ? (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Today's Session</p>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(today)}</p>
                {activeSession && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Active since {activeSession.clockIn}
                  </p>
                )}
              </div>
              <div className="flex min-w-[18rem] flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Clock In Time</span>
                    <input
                      type="time"
                      value={clockInTime}
                      disabled={!!activeSession || !canManageOwnTime}
                      onChange={(event) => setClockInTime(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Clock Out Time</span>
                    <input
                      type="time"
                      value={clockOutTime}
                      disabled={!activeSession || !canManageOwnTime}
                      onChange={(event) => setClockOutTime(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!activeSession || !canManageOwnTime || isSubmitting !== null}
                  onClick={() => {
                    void handleClockIn();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                  </svg>
                  {isSubmitting === "clock_in" ? "Clocking In…" : "Clock In"}
                </button>
                <button
                  type="button"
                  disabled={!activeSession || !canManageOwnTime || isSubmitting !== null}
                  onClick={() => {
                    void handleClockOut();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  {isSubmitting === "clock_out" ? "Clocking Out…" : "Clock Out"}
                </button>
              </div>
              {!canManageOwnTime && (
                <p className="text-xs text-slate-500">
                  Only the signed-in employee can submit live time entries.
                </p>
              )}
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
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{entry.clockOut || "--"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-medium text-slate-900">
                        {entry.clockOut ? hoursWorked(entry.clockIn, entry.clockOut) : "--"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {entry.clockOut ? <Badge variant="success">Approved</Badge> : <Badge variant="warning">Active</Badge>}
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
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatDays(metrics.currentPeriodDays)} working days</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Schedule hours</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{(metrics.currentPeriodHours).toFixed(2)} scheduled hours earned so far</p>
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

      {canManageOwnTime && (
        <>
          {(timeOffMessage || timeOffError) && (
            <Card className={`${timeOffError ? "border-red-200 bg-red-50/40" : "border-emerald-200 bg-emerald-50/40"} p-4`}>
              <p className={`text-sm font-semibold ${timeOffError ? "text-red-800" : "text-emerald-800"}`}>
                {timeOffError || timeOffMessage}
              </p>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">My Days Off</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Request days off across the April 1 to March 31 allowance year. Days off must land on a scheduled working day that is not already a company holiday. If you are at the limit, you can still move an existing booked day.
                </p>
              </div>
              {myTimeOffAllowance && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Allowance</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{myTimeOffAllowance.maxDays} days</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Booked</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{myTimeOffAllowance.reservedDays} days</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Remaining</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{myTimeOffAllowance.remainingDays} days</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr,1fr,auto]">
              <input
                type="date"
                value={timeOffDate}
                min={today}
                onChange={(event) => setTimeOffDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                value={timeOffNote}
                onChange={(event) => setTimeOffNote(event.target.value)}
                placeholder="Optional note"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={isSavingTimeOff || !timeOffDate}
                onClick={() => {
                  void handleSaveTimeOff();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                {isSavingTimeOff ? "Saving..." : editingTimeOffId ? "Save Change" : "Request Day Off"}
              </button>
            </div>
            {editingTimeOffId && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTimeOffId(null);
                    setTimeOffDate(today);
                    setTimeOffNote("");
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              </div>
            )}
            {myTimeOffAllowance && (
              <p className="mt-3 text-xs text-slate-500">
                Allowance window: {formatDate(myTimeOffAllowance.yearStart)} to {formatDate(myTimeOffAllowance.yearEnd)}.
              </p>
            )}
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Requested Days Off</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Note</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {myTimeOffRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="px-5 py-3 text-sm font-medium text-slate-900">{request.date}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{request.note || "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={request.status === "approved" ? "success" : request.status === "pending" ? "warning" : "default"}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {request.date >= today && request.status !== "cancelled" && request.status !== "rejected" && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => beginEditTimeOff(request.id)}
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleCancelTimeOff(request.id);
                              }}
                              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
