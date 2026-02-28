"use client";

import { useAccount } from "wagmi";
import { useMockPayroll } from "@/components/MockPayrollProvider";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { CEO_ADDRESS } from "@/lib/contracts";

function payTypeLabel(payType: string) {
  return payType === "yearly" ? "Annual Salary" : payType === "daily" ? "Daily Rate" : "Hourly Rate";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRate(payType: string, rate: number) {
  if (payType === "yearly") return `$${rate.toLocaleString()}/yr`;
  if (payType === "daily") return `$${rate}/day`;
  return `$${rate}/hr`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MyEarningsPage() {
  const { address } = useAccount();
  const {
    recipients,
    today,
    currentPeriodStart,
    currentPeriodEnd,
    previewEmployeeId,
    setPreviewEmployeeId,
    getRecipientByWallet,
    getRecipientById,
    getRecipientMetrics,
  } = useMockPayroll();

  const connectedRecipient = getRecipientByWallet(address);
  const isAdmin = !!address && address.toLowerCase() === CEO_ADDRESS.toLowerCase();
  const recipient = connectedRecipient ?? getRecipientById(previewEmployeeId) ?? recipients[0];
  const metrics = recipient ? getRecipientMetrics(recipient.id) : null;

  if (!recipient || !metrics) {
    return null;
  }

  const pctPaid = metrics.ytdEarned > 0 ? Math.round((metrics.totalPaid / metrics.ytdEarned) * 100) : 0;
  const timeWorkedLabel =
    recipient.payType === "hourly"
      ? `${metrics.currentPeriodHours.toFixed(1)} hrs this period`
      : `${metrics.currentPeriodDays} working days this period`;
  const ytdTimeWorkedLabel =
    recipient.payType === "hourly"
      ? `${metrics.ytdHours.toFixed(1)} hrs YTD`
      : `${metrics.ytdDays} working days YTD`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Track pro-rated earnings, paid history, and the balance currently available to withdraw.
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current Period"
          value={formatCurrency(metrics.currentPeriodEarned)}
          subtitle={`${formatDate(currentPeriodStart)} - ${formatDate(currentPeriodEnd)}`}
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="YTD Earned"
          value={formatCurrency(metrics.ytdEarned)}
          subtitle="Pro-rated through today"
          icon="M4.5 19.5h15m-15-4.5h15m-15-4.5h15m-15-4.5h15"
        />
        <StatCard
          label="Already Paid"
          value={formatCurrency(metrics.totalPaid)}
          subtitle="Executed pay runs"
          icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Available to Withdraw"
          value={formatCurrency(metrics.availableToWithdraw)}
          subtitle="Earned minus paid"
          valueClassName="text-emerald-700"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Payout Progress</h3>
          <p className="mt-1 text-xs text-slate-500">Percentage of earned wages already paid this year</p>
          <div className="mt-4">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-900">{pctPaid}%</span>
              <span className="text-xs text-slate-400">
                {formatCurrency(metrics.totalPaid)} of {formatCurrency(metrics.ytdEarned)}
              </span>
            </div>
            <div className="mt-3 h-3 w-full rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                style={{ width: `${pctPaid}%` }}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Current period</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{timeWorkedLabel}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Year to date</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{ytdTimeWorkedLabel}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Compensation Details</h3>
          <p className="mt-1 text-xs text-slate-500">Pay basis, chain preference, and tracking model</p>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Employee</dt>
              <dd className="text-sm font-semibold text-slate-900">{recipient.name}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Pay Type</dt>
              <dd className="text-sm font-semibold text-slate-900">{payTypeLabel(recipient.payType)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Rate</dt>
              <dd className="text-sm font-semibold text-slate-900">{formatRate(recipient.payType, recipient.rate)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Preferred Chain</dt>
              <dd className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {recipient.chainPreference ?? "Arc"}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <dt className="text-sm text-slate-500">Tracking Mode</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {recipient.timeTrackingMode === "check_in_out" ? "Manual Check-in/out" : "Schedule-based"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Breakdown input</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {recipient.payType === "hourly" ? `${metrics.currentPeriodHours.toFixed(1)} hours` : `${metrics.currentPeriodDays} working days`}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Holiday exclusions</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {metrics.currentPeriodHolidayCount} this period / {metrics.ytdHolidayCount} YTD
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Schedule baseline</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {metrics.scheduleHoursPerDay} hrs scheduled day
            </p>
          </div>
        </div>
      </Card>

      <Card className="border-amber-200 bg-amber-50/30 p-4">
        <div className="flex gap-3">
          <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">How withdrawals work</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Available to withdraw is calculated as earned wages to date minus amounts already paid in executed pay runs.
              Holidays and non-working days are excluded from the schedule-based calculation.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
