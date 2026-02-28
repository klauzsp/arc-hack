"use client";

import Link from "next/link";
import { useMockPayroll } from "@/components/MockPayrollProvider";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";

function statusVariant(status: string): "success" | "warning" | "info" | "default" {
  if (status === "executed") return "success";
  if (status === "approved") return "info";
  if (status === "pending") return "warning";
  return "default";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const { dashboard, treasury, payRuns, recipients, today, loading } = useMockPayroll();
  const chainBalances = treasury?.chainBalances ?? [];
  const upcomingRun = payRuns.find(
    (payRun) => payRun.status === "approved" || payRun.status === "pending" || payRun.status === "draft",
  );
  const lastExecutedRun = [...payRuns]
    .reverse()
    .find((payRun) => payRun.status === "executed");
  const recentRuns = [...payRuns].slice(-4).reverse();
  const issueCount = dashboard?.alerts.length ?? recipients.filter((recipient) => !recipient.chainPreference).length;

  if (loading && !dashboard) {
    return <div className="text-sm text-slate-500">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Multi-chain USDC. One liquidity surface. Arc routes and settles.
          </p>
          <p className="mt-1 text-xs text-slate-400">As of {formatDate(today)}</p>
        </div>
        <Badge variant="info">{recipients.length} active recipients</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total USDC"
          value={formatCurrency(treasury?.totalUsdc ?? 0)}
          subtitle="Across all chains"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
        <StatCard
          label="Yield (USYC)"
          value={formatCurrency(treasury?.totalUsyc ?? 0)}
          subtitle="Idle capital earning yield"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          trend={{ value: "+4.2% APY", positive: true }}
        />
        <StatCard
          label="Next Pay Run"
          value={upcomingRun ? formatCurrency(upcomingRun.totalAmount) : "None"}
          subtitle={
            upcomingRun
              ? `${formatDate(upcomingRun.periodStart)} - ${formatDate(upcomingRun.periodEnd)}`
              : "No pay runs scheduled"
          }
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          label="Last Pay Date"
          value={lastExecutedRun ? formatDate(lastExecutedRun.periodEnd) : "Not yet paid"}
          subtitle={lastExecutedRun ? formatCurrency(lastExecutedRun.totalAmount) : "Awaiting first execution"}
          icon="M8.25 18.75a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5h7.5a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5h-7.5zM9 10.5h6M9 13.5h6"
        />
        <StatCard
          label="Open Alerts"
          value={String(issueCount)}
          subtitle={issueCount === 0 ? "No variances or missing setup" : "Recipients need review"}
          icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          valueClassName={issueCount === 0 ? "text-emerald-700" : "text-amber-700"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent Pay Runs</h2>
              <p className="mt-0.5 text-xs text-slate-500">Review the latest payroll drafts, approvals, and executions.</p>
            </div>
            <Link href="/pay-runs" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentRuns.map((payRun) => (
              <Link
                key={payRun.id}
                href={`/pay-runs/${payRun.id}`}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {formatDate(payRun.periodStart)} - {formatDate(payRun.periodEnd)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payRun.recipientCount} recipients
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(payRun.totalAmount)}
                  </span>
                  <Badge variant={statusVariant(payRun.status)}>
                    {payRun.status.charAt(0).toUpperCase() + payRun.status.slice(1)}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Chain Balances</h2>
            <Link href="/treasury" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Treasury
            </Link>
          </div>
          <div className="space-y-3 p-5">
            {chainBalances.map((chain) => {
              const percent = treasury?.totalUsdc ? Math.round((chain.usdcBalance / treasury.totalUsdc) * 100) : 0;
              return (
                <div key={chain.chainId}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="font-medium text-slate-700">{chain.chainName}</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(chain.usdcBalance)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-0.5 text-right text-[10px] text-slate-400">{percent}%</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Arc settlement status</p>
              <p className="text-xs text-slate-500">
                Treasury routing and payroll previews are healthy across {chainBalances.length} chains.
              </p>
            </div>
          </div>
          <Badge variant={issueCount === 0 ? "success" : "warning"}>
            {issueCount === 0 ? "Healthy" : `${issueCount} attention needed`}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
