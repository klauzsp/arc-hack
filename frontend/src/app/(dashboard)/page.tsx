"use client";

import Link from "next/link";
import { usePayroll } from "@/components/PayrollProvider";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
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
  const { dashboard, treasury, payRuns, recipients, today, loading } = usePayroll();
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
    return <div className="text-sm text-white/50">Loading dashboard…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Overview"
        title="Treasury, payroll, and liquidity at a glance."
        description="Track your treasury balance, upcoming payroll, and payout readiness across every connected chain."
        meta={
          <>
            <Badge variant="info">{recipients.length} employees</Badge>
            <Badge variant="default">{formatDate(today)}</Badge>
          </>
        }
      />

      {/* ── 5 Stat Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total USDC"
          value={formatCurrency(treasury?.totalUsdc ?? 0)}
          subtitle="Across all chains"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
        <StatCard
          label="Yield (USYC)"
          value={formatCurrency(treasury?.totalUsyc ?? 0)}
          subtitle="Idle capital earning"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          trend={{ value: "+4.2% APY", positive: true }}
        />
        <StatCard
          label="Next Pay Run"
          value={upcomingRun ? formatCurrency(upcomingRun.totalAmount) : "None"}
          subtitle={
            upcomingRun
              ? `${formatDate(upcomingRun.periodStart)} – ${formatDate(upcomingRun.periodEnd)}${today > upcomingRun.periodEnd ? " · Pay period passed" : ""}`
              : "No runs scheduled"
          }
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          label="Last Pay Date"
          value={lastExecutedRun ? formatDate(lastExecutedRun.periodEnd) : "Not yet paid"}
          subtitle={lastExecutedRun ? formatCurrency(lastExecutedRun.totalAmount) : "Awaiting first run"}
          icon="M8.25 18.75a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5h7.5a1.5 1.5 0 011.5 1.5v10.5a1.5 1.5 0 01-1.5 1.5h-7.5zM9 10.5h6M9 13.5h6"
        />
        <StatCard
          label="Open Alerts"
          value={String(issueCount)}
          subtitle={issueCount === 0 ? "All good" : "Needs review"}
          icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          valueClassName={issueCount === 0 ? "text-emerald-400" : "text-amber-400"}
        />
      </div>

      {/* ── Recent Pay Runs + Chain Balances ── */}
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Recent Pay Runs */}
        <Card className="lg:col-span-2">
          <div className="flex min-w-0 items-center justify-between gap-4 px-7 py-6">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white">Recent Pay Runs</h2>
              <p className="mt-0.5 truncate text-[12px] text-white/40">Latest payroll activity</p>
            </div>
            <Link href="/pay-runs" className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white">
              View all
            </Link>
          </div>

          <div className="border-t border-white/[0.05]">
            {recentRuns.map((payRun, i) => (
              <Link
                key={payRun.id}
                href={`/pay-runs/${payRun.id}`}
                className={`flex min-w-0 items-center justify-between gap-4 px-7 py-4 transition-colors hover:bg-white/[0.03] ${
                  i > 0 ? "border-t border-white/[0.04]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-white/90">
                    {formatDate(payRun.periodStart)} – {formatDate(payRun.periodEnd)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {payRun.recipientCount} employees
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-[13px] font-semibold tabular-nums text-white">
                    {formatCurrency(payRun.totalAmount)}
                  </span>
                  <Badge variant={statusVariant(payRun.status)}>
                    {payRun.status.charAt(0).toUpperCase() + payRun.status.slice(1)}
                  </Badge>
                </div>
              </Link>
            ))}
            {recentRuns.length === 0 && (
              <div className="px-7 py-8 text-center text-[13px] text-white/30">No pay runs yet</div>
            )}
          </div>
        </Card>

        {/* Chain Balances */}
        <Card>
          <div className="flex min-w-0 items-center justify-between gap-4 px-7 py-6">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white">Chain Balances</h2>
              <p className="mt-0.5 truncate text-[12px] text-white/40">USDC by network</p>
            </div>
            <Link href="/treasury" className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white">
              Treasury
            </Link>
          </div>

          <div className="border-t border-white/[0.05] px-7 py-6">
            <div className="flex flex-col gap-4">
              {chainBalances.map((chain) => {
                const percent = treasury?.totalUsdc ? Math.round((chain.usdcBalance / treasury.totalUsdc) * 100) : 0;
                return (
                  <div key={chain.chainId} className="min-w-0">
                    <div className="flex min-w-0 items-center justify-between gap-3 text-[13px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#fc72ff]" />
                        <span className="truncate font-medium text-white/70">{chain.chainName}</span>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-white">
                        {formatCurrency(chain.usdcBalance)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-[#fc72ff] to-[#7b61ff] transition-all" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-0.5 text-right text-[10px] text-white/30">{percent}%</p>
                  </div>
                );
              })}
              {chainBalances.length === 0 && (
                <div className="py-4 text-center text-[13px] text-white/30">No chains connected</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Settlement Status ── */}
      <Card className="px-7 py-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">Settlement status</p>
              <p className="mt-0.5 truncate text-[12px] text-white/40">
                Healthy across {chainBalances.length} chains
              </p>
            </div>
          </div>
          <span className="shrink-0">
            <Badge variant={issueCount === 0 ? "success" : "warning"}>
              {issueCount === 0 ? "Healthy" : `${issueCount} attention needed`}
            </Badge>
          </span>
        </div>
      </Card>
    </div>
  );
}
