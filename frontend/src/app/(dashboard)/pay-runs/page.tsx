"use client";

import Link from "next/link";
import { mockPayRuns } from "@/lib/mockPayRuns";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

function statusVariant(s: string): "success" | "warning" | "info" | "default" {
  if (s === "executed") return "success";
  if (s === "approved") return "info";
  if (s === "pending") return "warning";
  return "default";
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function PayRunsPage() {
  const executed = mockPayRuns.filter((pr) => pr.status === "executed");
  const totalPaid = executed.reduce((acc, pr) => acc + pr.totalAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Manage bi-weekly payroll runs. Create, review, and execute multi-chain USDC payouts.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Pay Run
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Runs</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{mockPayRuns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Completed</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{executed.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Disbursed</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Period
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Amount
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Recipients
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tx Hash
                </th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mockPayRuns.map((pr) => (
                <tr key={pr.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-5 py-4">
                    <p className="text-sm font-medium text-slate-900">{pr.periodStart} &ndash; {pr.periodEnd}</p>
                    {pr.executedAt && (
                      <p className="mt-0.5 text-xs text-slate-400">Executed {new Date(pr.executedAt).toLocaleDateString()}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <Badge variant={statusVariant(pr.status)}>
                      {pr.status.charAt(0).toUpperCase() + pr.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-900">
                    {formatCurrency(pr.totalAmount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">
                      {pr.recipientCount}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-xs text-slate-400">
                    {pr.txHash ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <Link
                      href={`/pay-runs/${pr.id}`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      View
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
