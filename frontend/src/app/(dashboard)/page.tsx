"use client";

import Link from "next/link";
import { mockPayRuns } from "@/lib/mockPayRuns";
import {
  mockTotalTreasuryUsdc,
  mockTotalTreasuryUsyc,
  mockChainBalances,
} from "@/lib/mockTreasury";
import { mockRecipients } from "@/lib/mockRecipients";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";

function statusVariant(s: string): "success" | "warning" | "info" | "default" {
  if (s === "executed") return "success";
  if (s === "approved") return "info";
  if (s === "pending") return "warning";
  return "default";
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const nextRun = mockPayRuns.find((pr) => pr.status === "approved" || pr.status === "pending");
  const recentRuns = mockPayRuns.filter((pr) => pr.status === "executed").slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-slate-500">
          Overview of your payroll treasury, upcoming runs, and chain balances.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total USDC"
          value={formatCurrency(mockTotalTreasuryUsdc)}
          subtitle="Across all chains"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
        <StatCard
          label="Yield (USYC)"
          value={mockTotalTreasuryUsyc.toLocaleString()}
          subtitle="Earning yield on idle capital"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          trend={{ value: "+4.2% APY", positive: true }}
        />
        <StatCard
          label="Next Pay Run"
          value={nextRun ? formatCurrency(nextRun.totalAmount) : "None"}
          subtitle={nextRun ? `${nextRun.periodStart} - ${nextRun.periodEnd}` : "No upcoming runs"}
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          label="Total Recipients"
          value={String(mockRecipients.length)}
          subtitle={`${mockRecipients.filter(r => r.payType === "yearly").length} salaried, ${mockRecipients.filter(r => r.payType !== "yearly").length} hourly/daily`}
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent pay runs */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent Pay Runs</h2>
            <Link href="/pay-runs" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {mockPayRuns.slice(0, 4).map((pr) => (
              <Link key={pr.id} href={`/pay-runs/${pr.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{pr.periodStart} &ndash; {pr.periodEnd}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{pr.recipientCount} recipients</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(pr.totalAmount)}</span>
                  <Badge variant={statusVariant(pr.status)}>
                    {pr.status.charAt(0).toUpperCase() + pr.status.slice(1)}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Chain balances */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Chain Balances</h2>
            <Link href="/treasury" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Treasury
            </Link>
          </div>
          <div className="p-5 space-y-3">
            {mockChainBalances.map((c) => {
              const pct = Math.round((c.usdcBalance / mockTotalTreasuryUsdc) * 100);
              return (
                <div key={c.chainId}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="font-medium text-slate-700">{c.chainName}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatCurrency(c.usdcBalance)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-right text-[10px] text-slate-400">{pct}%</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Status bar */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">All systems operational</p>
              <p className="text-xs text-slate-500">No alerts or issues with pay runs</p>
            </div>
          </div>
          <Badge variant="success">Healthy</Badge>
        </div>
      </Card>
    </div>
  );
}
