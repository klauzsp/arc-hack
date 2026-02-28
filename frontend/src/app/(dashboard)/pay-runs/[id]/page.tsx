"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMockPayroll } from "@/components/MockPayrollProvider";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";

function statusVariant(status: string): "success" | "warning" | "info" | "default" {
  if (status === "executed" || status === "paid") return "success";
  if (status === "approved" || status === "ready") return "info";
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

export default function PayRunDetailPage() {
  const params = useParams();
  const { payRuns, recipients, approvePayRun, executePayRun } = useMockPayroll();
  const [wasExecuted, setWasExecuted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const id = params?.id as string;
  const payRun = payRuns.find((candidate) => candidate.id === id);

  if (!payRun) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-7 w-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-900">Pay run not found</p>
        <p className="mt-1 text-sm text-slate-500">The pay run you are looking for does not exist.</p>
        <Link href="/pay-runs" className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
          &larr; Back to pay runs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/pay-runs" className="hover:text-slate-700">Pay Runs</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-slate-900">
          {formatDate(payRun.periodStart)} - {formatDate(payRun.periodEnd)}
        </span>
      </nav>

      {wasExecuted && (
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-emerald-800">Pay run executed</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            The backend execution updated payout history and employee available balances.
          </p>
        </Card>
      )}

      {actionError && (
        <Card className="border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">{actionError}</p>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {formatDate(payRun.periodStart)} - {formatDate(payRun.periodEnd)}
              </h2>
              <Badge variant={statusVariant(payRun.status)}>
                {payRun.status.charAt(0).toUpperCase() + payRun.status.slice(1)}
              </Badge>
            </div>
            {payRun.executedAt && (
              <p className="mt-1.5 text-sm text-slate-500">
                Executed on{" "}
                {new Date(payRun.executedAt).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
            {payRun.txHash && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.314a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.04" />
                </svg>
                <span className="font-mono">{payRun.txHash}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {payRun.status === "draft" && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setIsSubmitting(true);
                  setActionError(null);
                  void approvePayRun(payRun.id)
                    .catch((error: unknown) => {
                      setActionError(error instanceof Error ? error.message : "Failed to approve pay run.");
                    })
                    .finally(() => setIsSubmitting(false));
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                Approve Pay Run
              </button>
            )}
            {payRun.status === "approved" && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setIsSubmitting(true);
                  setActionError(null);
                  void executePayRun(payRun.id)
                    .then(() => setWasExecuted(true))
                    .catch((error: unknown) => {
                      setActionError(error instanceof Error ? error.message : "Failed to execute pay run.");
                    })
                    .finally(() => setIsSubmitting(false));
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {isSubmitting ? "Executing…" : "Execute Pay Run"}
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Amount" value={formatCurrency(payRun.totalAmount)} icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <StatCard label="Recipients" value={String(payRun.recipientCount)} icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        <StatCard label="Avg per Recipient" value={formatCurrency(Math.round(payRun.totalAmount / payRun.recipientCount))} icon="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </div>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Recipient Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Wallet</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(payRun.items ?? []).map((item) => {
                const recipient = recipients.find((candidate) => candidate.id === item.recipientId);
                return (
                  <tr key={item.recipientId} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {recipient?.name.split(" ").map((part) => part[0]).join("") ?? "?"}
                        </div>
                        <span className="text-sm font-medium text-slate-900">
                          {recipient?.name ?? item.recipientId}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-400">
                      {recipient?.walletAddress
                        ? `${recipient.walletAddress.slice(0, 6)}...${recipient.walletAddress.slice(-4)}`
                        : "--"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-semibold text-slate-900">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right text-xs text-slate-500">
                      {recipient?.chainPreference ?? "Arc"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <Badge variant={statusVariant(item.status ?? "pending")}>
                        {(item.status ?? "pending").charAt(0).toUpperCase() + (item.status ?? "pending").slice(1)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
