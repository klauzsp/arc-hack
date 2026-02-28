"use client";

import {
  mockCurrentEmployee,
  mockTimeEntries,
  mockWorkingDays,
  mockHolidays,
} from "@/lib/mockEmployee";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hoursWorked(clockIn: string, clockOut: string): string {
  const [inH, inM] = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  const mins = (outH * 60 + outM) - (inH * 60 + inM);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function MyTimePage() {
  const e = mockCurrentEmployee;
  const isCheckInOut = e.timeTrackingMode === "check_in_out";

  const totalMins = mockTimeEntries.reduce((acc, t) => {
    const [inH, inM] = t.clockIn.split(":").map(Number);
    const [outH, outM] = t.clockOut.split(":").map(Number);
    return acc + (outH * 60 + outM) - (inH * 60 + inM);
  }, 0);
  const totalHours = (totalMins / 60).toFixed(1);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        {isCheckInOut
          ? "Track your working hours by clocking in and out each day."
          : "Your time is tracked automatically from your assigned schedule."}
      </p>

      {isCheckInOut ? (
        <>
          {/* Clock actions */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Today&rsquo;s Session</p>
                <p className="mt-0.5 text-xs text-slate-500">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                  </svg>
                  Clock In
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
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

          {/* Summary row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">This Period</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{totalHours} hrs</p>
              <p className="mt-0.5 text-xs text-slate-400">{mockTimeEntries.length} entries logged</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Est. Earnings</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">${(parseFloat(totalHours) * e.rate).toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-slate-400">@ ${e.rate}/hr</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <p className="text-sm font-semibold text-slate-900">Active</p>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">Tracking enabled</p>
            </Card>
          </div>

          {/* Time entries table */}
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
                  {mockTimeEntries.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-900">{t.date}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{t.clockIn}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{t.clockOut}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-medium text-slate-900">
                        {hoursWorked(t.clockIn, t.clockOut)}
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
          {/* Schedule-based view */}
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Schedule-Based Tracking</p>
                <p className="text-xs text-slate-500">Your time is tracked automatically. No manual check-in required.</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900">Working Days</h3>
              <p className="mt-1 text-xs text-slate-500">Your assigned work schedule</p>
              <div className="mt-4 flex gap-2">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => {
                  const isWork = mockWorkingDays.includes(i);
                  return (
                    <div
                      key={`${day}-${i}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                        isWork
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {mockWorkingDays.map((d) => dayNames[d]).join(", ")} ({mockWorkingDays.length} days/week)
              </p>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900">Upcoming Holidays</h3>
              <p className="mt-1 text-xs text-slate-500">Paid time off excluded from pro-rated calculation</p>
              <div className="mt-4 space-y-2">
                {mockHolidays.map((h) => {
                  const d = new Date(h + "T12:00:00");
                  const isPast = d < new Date();
                  return (
                    <div key={h} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isPast ? "bg-slate-300" : "bg-amber-400"}`} />
                        <span className={`text-sm ${isPast ? "text-slate-400" : "text-slate-700"}`}>
                          {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      {isPast && <Badge>Past</Badge>}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
