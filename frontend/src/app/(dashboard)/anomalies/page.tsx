"use client";

import { useAnomalyDetection } from "@/components/AnomalyProvider";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

/* ─── helpers ─── */

function severityVariant(severity: string): "success" | "warning" | "error" | "info" | "default" {
  switch (severity) {
    case "critical": return "error";
    case "high": return "error";
    case "medium": return "warning";
    case "low": return "info";
    default: return "default";
  }
}

function statusVariant(status: string): "success" | "warning" | "error" | "info" | "default" {
  switch (status) {
    case "rebalance_triggered": return "error";
    case "pending_review": return "warning";
    case "confirmed": return "error";
    case "review_dismissed": return "success";
    default: return "default";
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reputationColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

/* ─── component ─── */

export default function AnomaliesPage() {
  const {
    anomalies,
    summary,
    reputations,
    scanning,
    modelLoading,
    error,
    resolving,
    scanCount,
    autoScanEnabled,
    nextScanIn,
    blockedEmployeeIds,
    runScan,
    resolve,
    setAutoScanEnabled,
  } = useAnomalyDetection();

  if (modelLoading) {
    return <div className="text-sm text-white/50">Training Isolation Forest model…</div>;
  }

  const pendingReview = anomalies.filter((a) => a.status === "pending_review");
  const rebalanced = anomalies.filter((a) => a.status === "rebalance_triggered");

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Anomaly Detection Agent"
        title="Timecard anomaly detection powered by Isolation Forest."
        description="The Isolation Forest model is trained on 300 synthetic normal timecard patterns. Scans run automatically every 60 seconds, fetching live employee time entries from the backend. Employees with unresolved anomalies are blocked from withdrawing."
        actions={
          <div className="flex items-center gap-3">
            {/* Auto-scan toggle */}
            <button
              onClick={() => setAutoScanEnabled(!autoScanEnabled)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                autoScanEnabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 bg-white/[0.04] text-white/40"
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  autoScanEnabled ? "animate-pulse bg-emerald-400" : "bg-white/20"
                }`}
              />
              {autoScanEnabled ? `Auto-scan (${nextScanIn}s)` : "Auto-scan off"}
            </button>

            {/* Manual scan button */}
            <Button variant="primary" size="md" onClick={runScan} disabled={scanning}>
              {scanning ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Run Scan
                </>
              )}
            </Button>
          </div>
        }
        meta={
          <>
            <Badge variant="info">Isolation Forest</Badge>
            <Badge variant="default">Stork Oracle</Badge>
            {scanCount > 0 && (
              <Badge variant="success">{scanCount} scan{scanCount !== 1 ? "s" : ""} completed</Badge>
            )}
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* ── Blocked Employees Banner ── */}
      {blockedEmployeeIds.size > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-400">
          <span className="font-semibold">⚠ Withdrawal Hold:</span>{" "}
          {blockedEmployeeIds.size} employee{blockedEmployeeIds.size !== 1 ? "s" : ""} blocked from withdrawing due to unresolved anomalies.
          Resolve their anomalies below to lift the hold.
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Anomalies"
          value={String(summary?.totalAnomalies ?? 0)}
          subtitle="All time detected"
          icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
          valueClassName={summary?.totalAnomalies ? "text-amber-400" : "text-emerald-400"}
        />
        <StatCard
          label="Pending Review"
          value={String(summary?.pendingReview ?? 0)}
          subtitle="CEO action needed"
          icon="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          valueClassName={summary?.pendingReview ? "text-amber-400" : "text-emerald-400"}
        />
        <StatCard
          label="Rebalances"
          value={String(summary?.rebalancesTriggered ?? 0)}
          subtitle="Auto USYC → USDC"
          icon="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          valueClassName={summary?.rebalancesTriggered ? "text-red-400" : "text-emerald-400"}
        />
        <StatCard
          label="Avg Reputation"
          value={String(summary?.avgReputationScore ?? 100)}
          subtitle="Stork Oracle score"
          icon="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          valueClassName={
            (summary?.avgReputationScore ?? 100) >= 70
              ? "text-emerald-400"
              : (summary?.avgReputationScore ?? 100) >= 40
                ? "text-amber-400"
                : "text-red-400"
          }
        />
        <StatCard
          label="Withdrawals Blocked"
          value={String(blockedEmployeeIds.size)}
          subtitle="Pending resolution"
          icon="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          valueClassName={blockedEmployeeIds.size > 0 ? "text-red-400" : "text-emerald-400"}
        />
      </div>

      {/* ── Pending CEO Review ── */}
      {pendingReview.length > 0 && (
        <Card>
          <div className="flex min-w-0 items-center justify-between gap-4 px-7 py-6">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white">
                🔍 Pending CEO Review
              </h2>
              <p className="mt-0.5 truncate text-[12px] text-white/40">
                High-reputation employees flagged — requires manual verification. Withdrawals are held until resolved.
              </p>
            </div>
            <Badge variant="warning">{pendingReview.length} pending</Badge>
          </div>

          <div className="border-t border-white/[0.05]">
            {pendingReview.map((anomaly, i) => (
              <div
                key={anomaly.id}
                className={`flex min-w-0 flex-col gap-3 px-7 py-5 ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-white">
                        {anomaly.employeeName}
                      </p>
                      <Badge variant={severityVariant(anomaly.severity)}>
                        {anomaly.severity}
                      </Badge>
                      <Badge variant="info">
                        Score: {anomaly.anomalyScore.toFixed(3)}
                      </Badge>
                      <Badge variant="error">Withdrawal held</Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-white/40">
                      {formatTime(anomaly.detectedAt)} · Rep: {anomaly.reputationScore}/100
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {anomaly.reasons.map((reason, j) => (
                        <span
                          key={j}
                          className="inline-flex rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={resolving === anomaly.id}
                      onClick={() => resolve(anomaly.id, "confirmed")}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resolving === anomaly.id}
                      onClick={() => resolve(anomaly.id, "review_dismissed")}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Feature detail row */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/30">
                  <span>Clock-in: {anomaly.features.clockInHour.toFixed(1)}h</span>
                  <span>Duration: {anomaly.features.durationHours.toFixed(1)}h</span>
                  <span>Day: {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][anomaly.features.dayOfWeek]}</span>
                  <span>Since pay: {anomaly.features.daysSincePayDay}d</span>
                  <span>Until pay: {anomaly.features.daysUntilPayDay}d</span>
                  <span>Sched dev: {anomaly.features.scheduleDeviation > 0 ? "+" : ""}{anomaly.features.scheduleDeviation.toFixed(1)}h</span>
                  <span>Type: {["Yearly","Daily","Hourly"][anomaly.features.occupationType]}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Auto-Rebalanced ── */}
      {rebalanced.length > 0 && (
        <Card>
          <div className="flex min-w-0 items-center justify-between gap-4 px-7 py-6">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-white">
                ⚡ Automatic USYC Rebalances
              </h2>
              <p className="mt-0.5 truncate text-[12px] text-white/40">
                Low-reputation anomalies triggered protective USYC → USDC rebalance. Withdrawals held.
              </p>
            </div>
            <Badge variant="error">{rebalanced.length} rebalanced</Badge>
          </div>

          <div className="border-t border-white/[0.05]">
            {rebalanced.map((anomaly, i) => (
              <div
                key={anomaly.id}
                className={`flex min-w-0 items-center justify-between gap-4 px-7 py-4 ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-white/90">
                      {anomaly.employeeName}
                    </p>
                    <Badge variant={severityVariant(anomaly.severity)}>
                      {anomaly.severity}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {formatTime(anomaly.detectedAt)} · Score: {anomaly.anomalyScore.toFixed(3)} · Rep: {anomaly.reputationScore}/100
                  </p>
                  {anomaly.reasons.length > 0 && (
                    <p className="mt-1 text-[11px] text-white/30">
                      {anomaly.reasons.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {anomaly.rebalanceTxHash && (
                    <span className="truncate text-[11px] font-mono text-white/25" title={anomaly.rebalanceTxHash}>
                      tx: {anomaly.rebalanceTxHash.slice(0, 10)}…
                    </span>
                  )}
                  <Badge variant="error">Rebalanced</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Reputation Scores ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="px-7 py-6">
            <h2 className="text-[15px] font-semibold text-white">Stork Oracle Reputation Scores</h2>
            <p className="mt-0.5 text-[12px] text-white/40">Employee reputation from on-chain oracle feed</p>
          </div>
          <div className="border-t border-white/[0.05] px-7 py-4">
            <div className="flex flex-col gap-3">
              {reputations.map((rep) => {
                const pct = rep.score;
                return (
                  <div key={rep.employeeId} className="min-w-0">
                    <div className="flex min-w-0 items-center justify-between gap-3 text-[13px]">
                      <span className="truncate font-medium text-white/70">
                        {rep.employeeId}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${reputationColor(rep.score)}`}>
                        {rep.score}/100
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          pct >= 70
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                            : pct >= 40
                              ? "bg-gradient-to-r from-amber-500 to-amber-400"
                              : "bg-gradient-to-r from-red-500 to-red-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-white/25">
                      <span>{rep.anomalyCount} anomalies · {rep.confirmedAnomalyCount} confirmed</span>
                      <span>{pct < 40 ? "Auto-rebalance" : pct < 70 ? "Watch" : "Healthy"}</span>
                    </div>
                  </div>
                );
              })}
              {reputations.length === 0 && (
                <div className="py-4 text-center text-[13px] text-white/30">
                  No reputation data — waiting for first scan
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── Decision Logic ── */}
        <Card>
          <div className="px-7 py-6">
            <h2 className="text-[15px] font-semibold text-white">Decision Logic</h2>
            <p className="mt-0.5 text-[12px] text-white/40">How the agent routes anomalies</p>
          </div>
          <div className="border-t border-white/[0.05] px-7 py-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
                  <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Reputation &lt; 40 → USYC Rebalance</p>
                  <p className="mt-0.5 text-[12px] text-white/40">
                    Low-trust employees with anomalies trigger automatic USYC → USDC rebalance as a protective measure. Withdrawals are held until resolved.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                  <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Reputation ≥ 40 → CEO Manual Review</p>
                  <p className="mt-0.5 text-[12px] text-white/40">
                    Higher-trust employees get the benefit of the doubt. Anomalies queued for manual CEO review. Withdrawals held until the CEO confirms or dismisses.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <svg className="h-4 w-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Withdrawal Blocking</p>
                  <p className="mt-0.5 text-[12px] text-white/40">
                    Employees with unresolved anomalies (pending review or rebalance triggered) are automatically blocked from withdrawing until the CEO resolves the anomaly.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <svg className="h-4 w-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Features Analyzed</p>
                  <p className="mt-0.5 text-[12px] text-white/40">
                    Shift duration · Clock-in/out time · Schedule deviation · Day of week ·
                    Days since/until pay day · Occupation type · Pay rate · Weekend flag
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── All Anomalies History ── */}
      <Card>
        <div className="flex min-w-0 items-center justify-between gap-4 px-7 py-6">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-white">Anomaly History</h2>
            <p className="mt-0.5 truncate text-[12px] text-white/40">All detected anomalies</p>
          </div>
          <Badge variant="default">{anomalies.length} total</Badge>
        </div>

        <div className="border-t border-white/[0.05]">
          {anomalies.length === 0 && (
            <div className="px-7 py-12 text-center">
              <p className="text-[13px] text-white/30">
                {autoScanEnabled
                  ? "Waiting for first automated scan to complete…"
                  : "No anomalies detected yet. Enable auto-scan or click \"Run Scan\" to analyze timecards."}
              </p>
            </div>
          )}

          {/* Table header */}
          {anomalies.length > 0 && (
            <div className="grid grid-cols-[1fr_80px_80px_80px_80px_120px] gap-2 border-b border-white/[0.04] px-7 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/25">
              <span>Employee</span>
              <span>Severity</span>
              <span>Score</span>
              <span>Rep</span>
              <span>Action</span>
              <span>Status</span>
            </div>
          )}

          {anomalies.slice(0, 50).map((anomaly, i) => (
            <div
              key={anomaly.id}
              className={`grid grid-cols-[1fr_80px_80px_80px_80px_120px] items-center gap-2 px-7 py-3 text-[12px] ${
                i > 0 ? "border-t border-white/[0.03]" : ""
              } hover:bg-white/[0.02]`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white/80">{anomaly.employeeName}</p>
                <p className="mt-0.5 truncate text-[10px] text-white/25">{formatTime(anomaly.detectedAt)}</p>
              </div>
              <div>
                <Badge variant={severityVariant(anomaly.severity)}>
                  {anomaly.severity}
                </Badge>
              </div>
              <span className="tabular-nums text-white/50">{anomaly.anomalyScore.toFixed(3)}</span>
              <span className={`tabular-nums ${reputationColor(anomaly.reputationScore)}`}>
                {anomaly.reputationScore}
              </span>
              <span className="truncate text-[11px] text-white/40">
                {anomaly.action === "usyc_rebalance" ? "Rebalance" : "Review"}
              </span>
              <div>
                <Badge variant={statusVariant(anomaly.status)}>
                  {anomaly.status.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
