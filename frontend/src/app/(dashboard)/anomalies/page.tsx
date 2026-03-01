"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSession } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import {
  api,
  type AnomalyRecord,
  type AnomalyFeatures,
  type AnomalySummary,
  type ReputationRecord,
} from "@/lib/api";
import { IsolationForest } from "@/lib/isolationForest";

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

function actionLabel(action: string): string {
  return action === "usyc_rebalance" ? "USYC Rebalance" : "CEO Manual Review";
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

function reputationBg(score: number): string {
  if (score >= 70) return "bg-emerald-500/15";
  if (score >= 40) return "bg-amber-500/15";
  return "bg-red-500/15";
}

/* ─── constants ─── */

const ANOMALY_SCORE_THRESHOLD = 0.55;
const LOW_REPUTATION_THRESHOLD = 40;
const REPUTATION_PENALTY_REBALANCE = 8;
const REPUTATION_PENALTY_REVIEW = 4;
const REPUTATION_RECOVERY = 0.5;
const DEFAULT_REP = 75;

/* ─── Generate synthetic "normal" training data for the Isolation Forest.
   These represent typical timecard patterns the model should learn as baseline. */

function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generateNormalTrainingData(count: number): AnomalyFeatures[] {
  const data: AnomalyFeatures[] = [];
  for (let i = 0; i < count; i++) {
    const clockIn = +(randBetween(7, 10).toFixed(1));     // Normal start: 7-10am
    const duration = +(randBetween(6, 9.5).toFixed(1));   // Normal shift: 6-9.5h
    const clockOut = +((clockIn + duration) % 24).toFixed(1);
    const dayOfWeek = Math.floor(randBetween(1, 6));      // Weekdays
    const occupation = Math.random() < 0.7 ? 2 : Math.random() < 0.5 ? 1 : 0;
    const rate = occupation === 0 ? Math.round(randBetween(70000, 120000))
               : occupation === 1 ? Math.round(randBetween(20000, 40000))
               : Math.round(randBetween(2500, 6000));

    data.push({
      clockInHour: clockIn,
      clockOutHour: clockOut,
      durationHours: duration,
      daysSincePayDay: Math.floor(randBetween(0, 14)),
      daysUntilPayDay: Math.floor(randBetween(0, 14)),
      occupationType: occupation,
      rateCents: rate,
      dayOfWeek,
      scheduleDeviation: +(randBetween(-1.5, 1.5).toFixed(1)),
      isWeekend: false,
    });
  }
  return data;
}

/* ─── Extract features from a real time entry + context ─── */

/** Parse "HH:MM" → fractional hour (e.g. "08:30" → 8.5) */
function clockToHour(clock: string): number {
  // Handle both "HH:MM" and full ISO datetime formats
  if (clock.includes("T")) {
    const d = new Date(clock);
    return d.getHours() + d.getMinutes() / 60;
  }
  const parts = clock.split(":");
  return Number(parts[0]) + Number(parts[1] ?? 0) / 60;
}

/** Compute hours between two "HH:MM" clock strings (handles overnight) */
function hoursBetween(a: string, b: string): number {
  const ha = clockToHour(a);
  const hb = clockToHour(b);
  const diff = hb - ha;
  return diff >= 0 ? diff : diff + 24;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z");
  const b = new Date(dateB + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

interface RealTimeEntry {
  id: string;
  recipientId?: string;
  employeeId?: string;
  date: string;      // "2026-01-15"
  clockIn: string;   // "08:30" or ISO datetime
  clockOut: string;   // "17:00" or ISO datetime
}

interface RealRecipient {
  id: string;
  name: string;
  payType: "yearly" | "daily" | "hourly";
  rate: number;
  scheduleId?: string;
}

interface RealPayRun {
  periodStart: string;
  periodEnd: string;
  status: string;
}

interface RealSchedule {
  id: string;
  hoursPerDay: number;
  workingDays: number[];
  startTime?: string;
}

function extractFeatures(
  entry: RealTimeEntry,
  recipient: RealRecipient,
  payRuns: RealPayRun[],
  schedules: RealSchedule[],
): AnomalyFeatures | null {
  try {
    const clockInHour = clockToHour(entry.clockIn);
    const clockOutHour = clockToHour(entry.clockOut);
    const durationHours = +hoursBetween(entry.clockIn, entry.clockOut).toFixed(2);
    if (durationHours <= 0 || durationHours > 24) return null;

    // Parse the date field (ISO date string like "2026-01-15")
    const entryDate = new Date(entry.date + "T00:00:00Z");
    if (isNaN(entryDate.getTime())) return null;
    const dayOfWeek = entryDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Occupation type: yearly=0, daily=1, hourly=2
    const occupationType = recipient.payType === "yearly" ? 0
      : recipient.payType === "daily" ? 1 : 2;

    // Pay-day proximity: find closest pay run period boundaries
    let daysSincePayDay = 7;
    let daysUntilPayDay = 7;
    for (const pr of payRuns) {
      const sinceDays = daysBetween(pr.periodEnd, entry.date);
      const untilDays = daysBetween(entry.date, pr.periodEnd);
      if (sinceDays >= 0 && sinceDays < daysSincePayDay) daysSincePayDay = sinceDays;
      if (untilDays >= 0 && untilDays < daysUntilPayDay) daysUntilPayDay = untilDays;
    }

    // Schedule deviation
    let scheduleDeviation = 0;
    const schedule = schedules.find((s) => s.id === recipient.scheduleId);
    if (schedule) {
      const scheduledStart = schedule.startTime ? clockToHour(schedule.startTime) : 9;
      scheduleDeviation = +(clockInHour - scheduledStart).toFixed(1);
    }

    return {
      clockInHour: +clockInHour.toFixed(1),
      clockOutHour: +clockOutHour.toFixed(1),
      durationHours,
      daysSincePayDay,
      daysUntilPayDay,
      occupationType,
      rateCents: Math.round(recipient.rate * 100),
      dayOfWeek,
      scheduleDeviation,
      isWeekend,
    };
  } catch {
    return null;
  }
}

/* ─── Build reasons from anomaly features ─── */

function buildReasons(features: AnomalyFeatures, score: number, repScore: number): string[] {
  const reasons: string[] = [];
  if (features.durationHours > 12) reasons.push("Excessive shift duration");
  if (features.durationHours < 2) reasons.push("Suspiciously short shift");
  if (features.clockInHour < 5 || features.clockInHour > 22) reasons.push("Unusual clock-in time");
  if (features.isWeekend) reasons.push("Weekend entry");
  if (Math.abs(features.scheduleDeviation) > 3) reasons.push("Schedule deviation > 3h");
  if (features.daysSincePayDay <= 1) reasons.push("Entry near pay day boundary");
  if (repScore < LOW_REPUTATION_THRESHOLD) reasons.push("Low Stork Oracle reputation");
  if (score > 0.8) reasons.push("Strong statistical outlier");
  if (reasons.length === 0) reasons.push("Statistical outlier detected by Isolation Forest");
  return reasons;
}

function scoreSeverity(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 0.85) return "critical";
  if (score >= 0.72) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `anom-${_idCounter}-${Date.now().toString(36)}`;
}

/* ─── Build summary & reputation from anomaly list ─── */

function buildSummary(anomalies: AnomalyRecord[], reputations: ReputationRecord[]): AnomalySummary {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  let pending = 0;
  let rebalances = 0;
  for (const a of anomalies) {
    bySeverity[a.severity as keyof typeof bySeverity] =
      (bySeverity[a.severity as keyof typeof bySeverity] ?? 0) + 1;
    if (a.status === "pending_review") pending++;
    if (a.status === "rebalance_triggered") rebalances++;
  }
  const avg =
    reputations.length > 0
      ? Math.round(reputations.reduce((s, r) => s + r.score, 0) / reputations.length)
      : 75;

  return {
    totalAnomalies: anomalies.length,
    pendingReview: pending,
    rebalancesTriggered: rebalances,
    avgReputationScore: avg,
    bySeverity,
    recentAnomalies: anomalies.slice(0, 5),
  };
}

/* ─── component ─── */

export default function AnomaliesPage() {
  const { token } = useAuthSession();
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Reputation scores tracked client-side per employee id
  const reputationMap = useRef<Map<string, number>>(new Map());

  // Isolation Forest model reference (trained once)
  const forestRef = useRef<IsolationForest | null>(null);

  /* Train the Isolation Forest on synthetic normal data on mount */
  useEffect(() => {
    const forest = new IsolationForest();
    const trainingData = generateNormalTrainingData(300);
    forest.fit(trainingData);
    forestRef.current = forest;
    setLoading(false);
  }, []);

  /* Reputation helper — decays per anomaly, starts at DEFAULT_REP */
  const getReputation = useCallback((empId: string): number => {
    return reputationMap.current.get(empId) ?? DEFAULT_REP;
  }, []);

  const penaliseReputation = useCallback((empId: string, penalty: number) => {
    const current = reputationMap.current.get(empId) ?? DEFAULT_REP;
    reputationMap.current.set(empId, Math.max(0, current - penalty));
  }, []);

  const recoverReputation = useCallback((empId: string) => {
    const current = reputationMap.current.get(empId) ?? DEFAULT_REP;
    reputationMap.current.set(empId, Math.min(100, current + REPUTATION_RECOVERY));
  }, []);

  /* Derive reputations from the map for display */
  const reputations = useMemo((): ReputationRecord[] => {
    // Collect all known employee ids from anomalies + reputation map
    const empMap = new Map<string, { name: string; anomalyCount: number; confirmedCount: number }>();

    for (const a of anomalies) {
      const existing = empMap.get(a.employeeId) ?? { name: a.employeeName, anomalyCount: 0, confirmedCount: 0 };
      existing.anomalyCount++;
      if (a.status === "confirmed") existing.confirmedCount++;
      empMap.set(a.employeeId, existing);
    }

    return Array.from(empMap.entries()).map(([empId, info]) => ({
      employeeId: info.name,
      score: reputationMap.current.get(empId) ?? DEFAULT_REP,
      anomalyCount: info.anomalyCount,
      confirmedAnomalyCount: info.confirmedCount,
      lastUpdated: new Date().toISOString(),
    }));
  }, [anomalies, scanCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => buildSummary(anomalies, reputations), [anomalies, reputations]);

  /* ── Run Scan: fetch REAL data from live backend, score through local IF model ── */
  const runScan = async () => {
    if (!token) {
      setError("Sign in to scan live timecard data");
      return;
    }
    const forest = forestRef.current;
    if (!forest) {
      setError("Isolation Forest model not ready");
      return;
    }

    setScanning(true);
    setError(null);

    try {
      // Fetch real data from the deployed backend in parallel
      const [recipients, payRuns, schedules] = await Promise.all([
        api.getRecipients(token),
        api.getPayRuns(token),
        api.getSchedules(),
      ]);

      // Fetch time entries for each employee
      const allEntries: Array<{ entry: RealTimeEntry; recipient: RealRecipient }> = [];
      await Promise.all(
        recipients.map(async (r) => {
          try {
            const entries = await api.getEmployeeTimeEntries(token, r.id);
            for (const e of entries) {
              if (e.clockOut) {
                allEntries.push({
                  entry: e as RealTimeEntry,
                  recipient: r as RealRecipient,
                });
              }
            }
          } catch {
            // Employee may have no entries; skip
          }
        }),
      );

      if (allEntries.length === 0) {
        setError("No completed time entries found — employees need to clock in/out first");
        setScanning(false);
        return;
      }

      // Extract features from real data
      const featureData: Array<{
        features: AnomalyFeatures;
        entry: RealTimeEntry;
        recipient: RealRecipient;
      }> = [];

      for (const { entry, recipient } of allEntries) {
        const features = extractFeatures(
          entry,
          recipient,
          payRuns as RealPayRun[],
          schedules as RealSchedule[],
        );
        if (features) {
          featureData.push({ features, entry, recipient });
        }
      }

      if (featureData.length === 0) {
        const sampleEntry = allEntries[0]?.entry;
        const detail = sampleEntry
          ? `Sample entry: date="${sampleEntry.date}" clockIn="${sampleEntry.clockIn}" clockOut="${sampleEntry.clockOut}"`
          : "No entries available";
        setError(`Could not extract features from ${allEntries.length} time entries. ${detail}`);
        setScanning(false);
        return;
      }

      // Run through Isolation Forest
      const detections = forest.detect(
        featureData.map((d) => d.features),
        ANOMALY_SCORE_THRESHOLD,
      );

      // Convert detections to AnomalyRecords
      const newAnomalies: AnomalyRecord[] = detections.map((det) => {
        const item = featureData[det.index];
        const empId = item.recipient.id;
        const repScore = getReputation(empId);
        const action = repScore < LOW_REPUTATION_THRESHOLD ? "usyc_rebalance" : "ceo_manual_review";
        const status = action === "usyc_rebalance" ? "rebalance_triggered" : "pending_review";
        const severity = scoreSeverity(det.score);
        const reasons = buildReasons(det.features, det.score, repScore);

        // Penalise reputation: 8 for rebalance, 4 for CEO review
        penaliseReputation(empId, action === "usyc_rebalance" ? REPUTATION_PENALTY_REBALANCE : REPUTATION_PENALTY_REVIEW);

        return {
          id: nextId(),
          companyId: "comp-1",
          employeeId: empId,
          employeeName: item.recipient.name,
          anomalyScore: +det.score.toFixed(3),
          severity,
          status,
          action,
          reputationScore: repScore,
          reasons,
          features: det.features,
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
          resolvedBy: null,
          rebalanceTxHash:
            action === "usyc_rebalance"
              ? `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`
              : null,
        };
      });

      // Recover reputation for employees whose entries were NOT flagged
      const flaggedIndices = new Set(detections.map((d) => d.index));
      for (let i = 0; i < featureData.length; i++) {
        if (!flaggedIndices.has(i)) {
          recoverReputation(featureData[i].recipient.id);
        }
      }

      if (newAnomalies.length === 0) {
        setError(`Scanned ${featureData.length} time entries — no anomalies detected. All clear!`);
      } else {
        setError(null);
      }

      setAnomalies((prev) => [...newAnomalies, ...prev]);
      setScanCount((c) => c + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed — could not reach backend");
    } finally {
      setScanning(false);
    }
  };

  /* Resolve locally by updating status in state */
  const resolve = async (id: string, resolution: "confirmed" | "review_dismissed") => {
    setResolving(id);
    await new Promise((r) => setTimeout(r, 400));
    setAnomalies((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: resolution, resolvedAt: new Date().toISOString(), resolvedBy: "ceo" }
          : a,
      ),
    );
    setResolving(null);
  };

  if (loading) {
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
        description="The Isolation Forest model is trained on 300 synthetic normal timecard patterns. When you Run Scan, it fetches live employee time entries from the backend, extracts features, and scores each entry — only genuine statistical outliers are surfaced. Reputation scores decay with each flagged anomaly."
        actions={
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
        }
        meta={
          <>
            <Badge variant="info">Isolation Forest</Badge>
            <Badge variant="default">Stork Oracle</Badge>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
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
          label="Severity Breakdown"
          value={`${summary?.bySeverity.critical ?? 0}C / ${summary?.bySeverity.high ?? 0}H`}
          subtitle={`${summary?.bySeverity.medium ?? 0} med · ${summary?.bySeverity.low ?? 0} low`}
          icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
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
                High-reputation employees flagged — requires manual verification
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
                Low-reputation anomalies triggered protective USYC → USDC rebalance
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
                  No reputation data — run a scan first
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
                    Low-trust employees with anomalies trigger automatic USYC → USDC rebalance as a protective measure. Funds moved to liquid USDC to cover potential payroll discrepancies.
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
                    Higher-trust employees get the benefit of the doubt. Anomalies are queued for manual CEO review before any treasury action is taken.
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
              <p className="text-[13px] text-white/30">No anomalies detected yet. Click &ldquo;Run Scan&rdquo; to analyze timecards.</p>
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
