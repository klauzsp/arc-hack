"use client";

import { mockCurrentEmployee } from "@/lib/mockEmployee";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";

function payTypeLabel(p: string) {
  return p === "yearly" ? "Annual Salary" : p === "daily" ? "Daily Rate" : "Hourly Rate";
}
function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function formatRate(p: string, rate: number) {
  if (p === "yearly") return `$${rate.toLocaleString()}/yr`;
  if (p === "daily") return `$${rate}/day`;
  return `$${rate}/hr`;
}

export default function MyEarningsPage() {
  const e = mockCurrentEmployee;
  const pctPaid = e.earnedToDate > 0 ? Math.round((e.totalPaid / e.earnedToDate) * 100) : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Track your pro-rated earnings, past payouts, and available balance.
      </p>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Earned to Date"
          value={formatCurrency(e.earnedToDate)}
          subtitle="Pro-rated for time worked"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Already Paid"
          value={formatCurrency(e.totalPaid)}
          subtitle="From previous pay runs"
          icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Available to Withdraw"
          value={formatCurrency(e.availableToWithdraw)}
          subtitle="Earned minus paid"
          valueClassName="text-emerald-700"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
      </div>

      {/* Progress + details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Earnings Progress</h3>
          <p className="mt-1 text-xs text-slate-500">Percentage of earned amount already paid out</p>
          <div className="mt-4">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-900">{pctPaid}%</span>
              <span className="text-xs text-slate-400">{formatCurrency(e.totalPaid)} of {formatCurrency(e.earnedToDate)}</span>
            </div>
            <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                style={{ width: `${pctPaid}%` }}
              />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-600">Paid out</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="text-slate-600">Remaining</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Pay Details</h3>
          <p className="mt-1 text-xs text-slate-500">Your compensation structure</p>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Pay Type</dt>
              <dd className="text-sm font-semibold text-slate-900">{payTypeLabel(e.payType)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Rate</dt>
              <dd className="text-sm font-semibold text-slate-900">{formatRate(e.payType, e.rate)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Preferred Chain</dt>
              <dd className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {e.chainPreference ?? "Arc"}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Tracking Mode</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {e.timeTrackingMode === "check_in_out" ? "Manual Check-in/out" : "Schedule-based"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Notice */}
      <Card className="border-amber-200 bg-amber-50/30 p-4">
        <div className="flex gap-3">
          <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">How withdrawals work</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Your available-to-withdraw balance reflects earned wages minus amounts already paid in previous pay runs.
              Holidays and non-working days are excluded from your pro-rated calculation.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
