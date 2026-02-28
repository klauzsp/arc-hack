"use client";

import Link from "next/link";
import { useState } from "react";
import { useMockPayroll } from "@/components/MockPayrollProvider";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

function statusVariant(status: string): "success" | "warning" | "info" | "default" {
  if (status === "executed") return "success";
  if (status === "approved") return "info";
  if (status === "processing") return "warning";
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

export default function PayRunsPage() {
  const { payRuns, createPayRun, loading, error } = useMockPayroll();
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const sortedPayRuns = [...payRuns].reverse();
  const executedRuns = payRuns.filter((payRun) => payRun.status === "executed");
  const totalPaid = executedRuns.reduce((total, payRun) => total + payRun.totalAmount, 0);

  const handleCreatePayRun = async () => {
    setIsCreating(true);
    try {
      const payRun = await createPayRun();
      setLastCreatedId(payRun.id);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading && payRuns.length === 0) {
    return <div className="text-sm text-slate-500">Loading pay runs…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Create draft pay runs, review multi-chain payout previews, and execute approved payrolls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleCreatePayRun()}
          disabled={isCreating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {isCreating ? "Creating…" : "New Pay Run"}
        </button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </Card>
      )}

      {lastCreatedId && (
        <Card className="border-blue-200 bg-blue-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Draft pay run created</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Review the new draft and approve it before execution.
              </p>
            </div>
            <Link href={`/pay-runs/${lastCreatedId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
              Open draft
            </Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Runs</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{payRuns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Completed</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{executedRuns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Approved</p>
          <p className="mt-1 text-xl font-bold text-blue-700">
            {payRuns.filter((payRun) => payRun.status === "approved").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Disbursed</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Period</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Recipients</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Tx Hash</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedPayRuns.map((payRun) => (
                <tr key={payRun.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-5 py-4">
                    <p className="text-sm font-medium text-slate-900">
                      {formatDate(payRun.periodStart)} - {formatDate(payRun.periodEnd)}
                    </p>
                    {payRun.executedAt && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Executed {new Date(payRun.executedAt).toLocaleDateString("en-US")}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <Badge variant={statusVariant(payRun.status)}>
                      {payRun.status.charAt(0).toUpperCase() + payRun.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-900">
                    {formatCurrency(payRun.totalAmount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">
                      {payRun.recipientCount}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-xs text-slate-400">
                    {payRun.txHash ?? "--"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <Link
                      href={`/pay-runs/${payRun.id}`}
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
