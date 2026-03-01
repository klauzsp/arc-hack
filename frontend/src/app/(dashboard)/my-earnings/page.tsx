"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { usePayroll } from "@/components/PayrollProvider";
import { useAuthSession } from "@/components/AuthProvider";
import { useAnomalyDetection } from "@/components/AnomalyProvider";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { inputStyles } from "@/components/ui";

function payTypeLabel(payType: string) {
  return payType === "yearly"
    ? "Annual Salary"
    : payType === "daily"
      ? "Daily Rate"
      : "Hourly Rate";
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

function formatDays(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
  const { role, employee } = useAuthSession();
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
    withdrawNow,
    loading,
    error,
  } = usePayroll();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const connectedRecipient = getRecipientByWallet(address);
  const sessionRecipient = employee
    ? (getRecipientById(employee.id) ?? employee)
    : null;
  const isAdmin = role === "admin";
  const ownRecipient = sessionRecipient ?? connectedRecipient ?? null;
  const recipient = isAdmin
    ? (getRecipientById(previewEmployeeId) ?? recipients[0])
    : ownRecipient;
  const metrics = recipient ? getRecipientMetrics(recipient.id) : null;
  const canWithdraw = role === "employee" && ownRecipient?.id === recipient?.id;

  // Check if this employee is blocked from withdrawing due to unresolved anomalies
  const { isEmployeeBlocked } = useAnomalyDetection();
  const isBlocked = recipient ? isEmployeeBlocked(recipient.id) : false;
  const withdrawBlocked =
    !canWithdraw ||
    metrics?.availableToWithdraw === undefined ||
    metrics.availableToWithdraw <= 0 ||
    isWithdrawing ||
    isBlocked;

  if (loading && !metrics) {
    return <div className="text-sm text-white/50">Loading earnings…</div>;
  }

  if (!recipient || !metrics) {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/50">
          {error ?? "Sign in as an employee or admin to view earnings."}
        </p>
      </Card>
    );
  }

  const pctPaid =
    metrics.ytdEarned > 0
      ? Math.round((metrics.totalPaid / metrics.ytdEarned) * 100)
      : 0;
  const timeWorkedLabel =
    recipient.payType === "hourly"
      ? `${metrics.currentPeriodHours.toFixed(1)} hrs this period`
      : `${formatDays(metrics.currentPeriodDays)} working days this period`;
  const ytdTimeWorkedLabel =
    recipient.payType === "hourly"
      ? `${metrics.ytdHours.toFixed(1)} hrs YTD`
      : `${formatDays(metrics.ytdDays)} working days YTD`;

  const handleWithdrawNow = async () => {
    setWithdrawError(null);
    setWithdrawMessage(null);
    setIsWithdrawing(true);
    try {
      const response = await withdrawNow();
      setWithdrawMessage(
        response.status === "processing"
          ? `Treasury routed ${formatCurrency(response.amount)} to ${response.chainPreference}. CCTP delivery is in progress for ${response.walletAddress}.`
          : `Treasury paid ${formatCurrency(response.amount)} on ${response.chainPreference} to ${response.walletAddress}.`,
      );
    } catch (withdrawActionError) {
      setWithdrawError(
        withdrawActionError instanceof Error
          ? withdrawActionError.message
          : "Withdrawal failed.",
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Employee Earnings"
        title="My Earnings"
        description="Track pro-rated earnings, paid history, and the balance currently available to withdraw."
        meta={<Badge variant="default">As of {formatDate(today)}</Badge>}
        actions={
          <>
            {isAdmin ? (
              <select
                value={recipient.id}
                onChange={(event) => setPreviewEmployeeId(event.target.value)}
                className={`${inputStyles} min-w-[220px]`}
              >
                {recipients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              variant="success"
              disabled={withdrawBlocked}
              onClick={() => {
                void handleWithdrawNow();
              }}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 15.75L12 21m0 0l-5.25-5.25M12 21V3"
                />
              </svg>
              {isWithdrawing
                ? "Withdrawing…"
                : isBlocked
                  ? "Withdrawal Held"
                  : "Withdraw Now"}
            </Button>
          </>
        }
      />

      {isBlocked && (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <div className="flex gap-3">
            <svg
              className="h-5 w-5 shrink-0 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-300">
                Withdrawal on hold — anomaly detected
              </p>
              <p className="mt-0.5 text-xs text-red-400/80">
                An anomaly has been detected on your timecard and is pending
                review. Withdrawals are temporarily held until the anomaly is
                resolved by the CEO. Contact your administrator if you believe
                this is an error.
              </p>
            </div>
          </div>
        </Card>
      )}

      {withdrawMessage && (
        <Card className="border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-300">
            {withdrawMessage}
          </p>
        </Card>
      )}

      {withdrawError && (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{withdrawError}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
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
          valueClassName="text-emerald-400"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Payout Progress</h3>
          <p className="mt-1 text-xs text-white/50">
            Percentage of earned wages already paid this year
          </p>
          <div className="mt-4">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-white">{pctPaid}%</span>
              <span className="text-xs text-white/40">
                {formatCurrency(metrics.totalPaid)} of{" "}
                {formatCurrency(metrics.ytdEarned)}
              </span>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-white/[0.06]">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-[#fc72ff] to-[#7b61ff]"
                style={{ width: `${pctPaid}%` }}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">
                Current period
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {timeWorkedLabel}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">
                Year to date
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {ytdTimeWorkedLabel}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">
            Compensation Details
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Pay basis, chain preference, and tracking model
          </p>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Employee</dt>
              <dd className="text-sm font-semibold text-white">
                {recipient.name}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Pay Type</dt>
              <dd className="text-sm font-semibold text-white">
                {payTypeLabel(recipient.payType)}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Rate</dt>
              <dd className="text-sm font-semibold text-white">
                {formatRate(recipient.payType, recipient.rate)}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Preferred Chain</dt>
              <dd className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-[#fc72ff]" />
                {recipient.chainPreference ?? "Arc"}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Tracking Mode</dt>
              <dd className="text-sm font-semibold text-white">
                {recipient.timeTrackingMode === "check_in_out"
                  ? "Manual Check-in/out"
                  : "Schedule-based"}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-sm text-white/50">Worked Since</dt>
              <dd className="text-sm font-semibold text-white">
                {recipient.employmentStartDate
                  ? formatDate(recipient.employmentStartDate)
                  : "Not set"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">
              Breakdown input
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {recipient.payType === "hourly"
                ? `${metrics.currentPeriodHours.toFixed(1)} hours`
                : `${formatDays(metrics.currentPeriodDays)} working days`}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">
              Holiday exclusions
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {metrics.currentPeriodHolidayCount} this period /{" "}
              {metrics.ytdHolidayCount} YTD
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">
              Schedule baseline
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {metrics.scheduleHoursPerDay} hrs scheduled day
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
