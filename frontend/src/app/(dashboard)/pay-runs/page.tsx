"use client";

import Link from "next/link";
import { useState } from "react";
import { usePayroll } from "@/components/PayrollProvider";
import { Badge } from "@/components/Badge";
import { Button, buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

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
  const {
    payRuns,
    today,
    currentPeriodStart,
    currentPeriodEnd,
    createPayRun,
    createPayRunForPeriod,
    approvePayRun,
    executePayRun,
    finalizePayRun,
    loading,
    error,
  } = usePayroll();
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [executeEarlyError, setExecuteEarlyError] = useState<string | null>(null);
  const [isExecuteEarly, setIsExecuteEarly] = useState(false);
  const sortedPayRuns = [...payRuns];
  const executedRuns = payRuns.filter((payRun) => payRun.status === "executed");
  const totalPaid = executedRuns.reduce((total, payRun) => total + payRun.totalAmount, 0);

  const currentPeriodRun = payRuns.find(
    (r) => r.periodStart === currentPeriodStart && r.periodEnd === currentPeriodEnd,
  );

  const handleCreatePayRun = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const payRun = await createPayRun();
      setLastCreatedId(payRun.id);
    } catch (creationError) {
      setCreateError(creationError instanceof Error ? creationError.message : "Failed to create treasury pay run.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateRunForCurrentPeriod = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const payRun = await createPayRunForPeriod(currentPeriodStart, currentPeriodEnd);
      setLastCreatedId(payRun.id);
    } catch (creationError) {
      setCreateError(creationError instanceof Error ? creationError.message : "Failed to create pay run for current period.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecuteEarly = async () => {
    if (!currentPeriodRun) return;
    setIsExecuteEarly(true);
    setExecuteEarlyError(null);
    try {
      if (currentPeriodRun.status === "draft") {
        await approvePayRun(currentPeriodRun.id);
        await executePayRun(currentPeriodRun.id);
      } else if (currentPeriodRun.status === "approved" || currentPeriodRun.status === "pending") {
        await executePayRun(currentPeriodRun.id);
      } else if (currentPeriodRun.status === "processing") {
        await finalizePayRun(currentPeriodRun.id);
      }
    } catch (e) {
      setExecuteEarlyError(e instanceof Error ? e.message : "Failed to execute early.");
    } finally {
      setIsExecuteEarly(false);
    }
  };

  if (loading && payRuns.length === 0) {
    return <div className="text-sm text-white/50">Loading pay runs…</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payroll Operations"
        title="Treasury-backed pay runs."
        description="Create, approve, and execute payroll directly from the Core treasury with live payout tracking."
        actions={
          <Button onClick={() => void handleCreatePayRun()} disabled={isCreating}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {isCreating ? "Creating…" : "Create Treasury Pay Run"}
          </Button>
        }
      />

      {(error || createError) && (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{createError || error}</p>
        </Card>
      )}

      {lastCreatedId && (
        <Card className="border-[#fc72ff]/20 bg-[#fc72ff]/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Draft pay run created</p>
              <p className="mt-0.5 text-xs text-white/50">
                Review the draft, approve it to create the on-chain pay run, then execute it from treasury.
              </p>
            </div>
            <Link href={`/pay-runs/${lastCreatedId}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Open draft
            </Link>
          </div>
        </Card>
      )}

      <Card className="border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Current pay period</h3>
              {today > currentPeriodEnd && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                  Pay period passed
                </span>
              )}
            </div>
            <p className="mt-1 text-lg font-medium tabular-nums text-white">
              {formatDate(currentPeriodStart)} – {formatDate(currentPeriodEnd)}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Pay runs for this period include earnings to date (time entries and schedules from the period start through today).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {executeEarlyError && (
              <p className="w-full text-xs text-red-400">{executeEarlyError}</p>
            )}
            {!currentPeriodRun && (
              <Button
                variant="outline"
                disabled={isCreating}
                onClick={() => void handleCreateRunForCurrentPeriod()}
              >
                {isCreating ? "Creating…" : "Create run for current period"}
              </Button>
            )}
            {currentPeriodRun?.status === "draft" && (
              <Button
                variant="success"
                disabled={isExecuteEarly}
                onClick={() => void handleExecuteEarly()}
              >
                {isExecuteEarly ? "Approving & executing…" : "Approve & execute early"}
              </Button>
            )}
            {(currentPeriodRun?.status === "approved" || currentPeriodRun?.status === "pending") && (
              <Button
                variant="success"
                disabled={isExecuteEarly}
                onClick={() => void handleExecuteEarly()}
              >
                {isExecuteEarly ? "Executing…" : "Execute early"}
              </Button>
            )}
            {currentPeriodRun?.status === "processing" && (
              <Button
                variant="outline"
                disabled={isExecuteEarly}
                onClick={() => void handleExecuteEarly()}
              >
                {isExecuteEarly ? "Finalizing…" : "Finalize"}
              </Button>
            )}
            {currentPeriodRun?.status === "executed" && (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300">
                Completed
              </span>
            )}
            {currentPeriodRun && currentPeriodRun.status !== "executed" && (
              <Link
                href={`/pay-runs/${currentPeriodRun.id}`}
                className={buttonStyles({ variant: "ghost", size: "sm", className: "text-white/60 hover:text-white" })}
              >
                View run
              </Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Total Runs</p>
          <p className="mt-1 text-xl font-bold text-white">{payRuns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Completed</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">{executedRuns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Approved</p>
          <p className="mt-1 text-xl font-bold text-[#fc72ff]">
            {payRuns.filter((payRun) => payRun.status === "approved").length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Total Disbursed</p>
          <p className="mt-1 text-xl font-bold text-white">{formatCurrency(totalPaid)}</p>
        </Card>
      </div>

      <Card>
        {sortedPayRuns.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-white">No treasury pay runs yet</p>
            <p className="mt-1 text-sm text-white/50">
              Create the first live pay run after adding at least one active recipient.
            </p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Period</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Status</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Amount</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Recipients</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Tx Hash</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sortedPayRuns.map((payRun) => (
                <tr key={payRun.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-5 py-4">
                    <p className="text-sm font-medium text-white">
                      {formatDate(payRun.periodStart)} - {formatDate(payRun.periodEnd)}
                    </p>
                    {payRun.executedAt && (
                      <p className="mt-0.5 text-xs text-white/40">
                        Executed {new Date(payRun.executedAt).toLocaleDateString("en-US")}
                      </p>
                    )}
                    {today > payRun.periodEnd && payRun.status !== "executed" && (
                      <p className="mt-0.5 text-xs font-medium text-amber-400">Pay period passed</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusVariant(payRun.status)}>
                        {payRun.status.charAt(0).toUpperCase() + payRun.status.slice(1)}
                      </Badge>
                      {today > payRun.periodEnd && payRun.status !== "executed" && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                          Period passed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-white">
                    {formatCurrency(payRun.totalAmount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-white/[0.08] px-2 text-xs font-medium text-white/60">
                      {payRun.recipientCount}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-xs text-white/40">
                    {payRun.txHash ?? "--"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <Link
                      href={`/pay-runs/${payRun.id}`}
                      className={buttonStyles({ variant: "ghost", size: "sm", className: "text-[#fc72ff] hover:bg-[#fc72ff]/[0.08]" })}
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
        )}
      </Card>
    </div>
  );
}
