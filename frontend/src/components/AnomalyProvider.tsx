"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthSession } from "@/components/AuthProvider";
import {
  api,
  type AnomalyRecord,
  type AnomalyFeatures,
  type AnomalySummary,
  type ReputationRecord,
} from "@/lib/api";
import { IsolationForest } from "@/lib/isolationForest";

/* ─── constants ─── */

const ANOMALY_SCORE_THRESHOLD = 0.55;
const LOW_REPUTATION_THRESHOLD = 40;
const REPUTATION_PENALTY_REBALANCE = 8;
const REPUTATION_PENALTY_REVIEW = 4;
const REPUTATION_RECOVERY = 0.5;
const DEFAULT_REP = 75;

/** Auto-scan interval in ms (60 seconds) */
const AUTO_SCAN_INTERVAL_MS = 60_000;

/** localStorage key for persisting blocked employee IDs */
const BLOCKED_EMPLOYEES_KEY = "anomaly_blocked_employees";

/* ─── helpers ─── */

function randBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generateNormalTrainingData(count: number): AnomalyFeatures[] {
  const data: AnomalyFeatures[] = [];
  for (let i = 0; i < count; i++) {
    const clockIn = +(randBetween(7, 10).toFixed(1));
    const duration = +(randBetween(6, 9.5).toFixed(1));
    const clockOut = +((clockIn + duration) % 24).toFixed(1);
    const dayOfWeek = Math.floor(randBetween(1, 6));
    const occupation = Math.random() < 0.7 ? 2 : Math.random() < 0.5 ? 1 : 0;
    const rate =
      occupation === 0
        ? Math.round(randBetween(70000, 120000))
        : occupation === 1
          ? Math.round(randBetween(20000, 40000))
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

/** Parse "HH:MM" → fractional hour (e.g. "08:30" → 8.5) */
function clockToHour(clock: string): number {
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
  date: string;
  clockIn: string;
  clockOut: string;
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

    const entryDate = new Date(entry.date + "T00:00:00Z");
    if (isNaN(entryDate.getTime())) return null;
    const dayOfWeek = entryDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const occupationType =
      recipient.payType === "yearly" ? 0 : recipient.payType === "daily" ? 1 : 2;

    let daysSincePayDay = 7;
    let daysUntilPayDay = 7;
    for (const pr of payRuns) {
      const sinceDays = daysBetween(pr.periodEnd, entry.date);
      const untilDays = daysBetween(entry.date, pr.periodEnd);
      if (sinceDays >= 0 && sinceDays < daysSincePayDay) daysSincePayDay = sinceDays;
      if (untilDays >= 0 && untilDays < daysUntilPayDay) daysUntilPayDay = untilDays;
    }

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

function buildReasons(
  features: AnomalyFeatures,
  score: number,
  repScore: number,
): string[] {
  const reasons: string[] = [];
  if (features.durationHours > 12) reasons.push("Excessive shift duration");
  if (features.durationHours < 2) reasons.push("Suspiciously short shift");
  if (features.clockInHour < 5 || features.clockInHour > 22)
    reasons.push("Unusual clock-in time");
  if (features.isWeekend) reasons.push("Weekend entry");
  if (Math.abs(features.scheduleDeviation) > 3) reasons.push("Schedule deviation > 3h");
  if (features.daysSincePayDay <= 1) reasons.push("Entry near pay day boundary");
  if (repScore < LOW_REPUTATION_THRESHOLD) reasons.push("Low Stork Oracle reputation");
  if (score > 0.8) reasons.push("Strong statistical outlier");
  if (reasons.length === 0)
    reasons.push("Statistical outlier detected by Isolation Forest");
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

/** Unique key for deduplication — same employee + same time entry = same anomaly */
function anomalyKey(empId: string, date: string, clockIn: string, clockOut: string): string {
  return `${empId}|${date}|${clockIn}|${clockOut}`;
}

function buildSummary(
  anomalies: AnomalyRecord[],
  reputations: ReputationRecord[],
): AnomalySummary {
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

/* ─── Persist / load blocked employees from localStorage ─── */

function loadBlockedEmployees(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_EMPLOYEES_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveBlockedEmployees(ids: Set<string>) {
  try {
    localStorage.setItem(BLOCKED_EMPLOYEES_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/* ─── Context type ─── */

type AnomalyContextValue = {
  /** All detected anomalies (newest first) */
  anomalies: AnomalyRecord[];
  /** Summary statistics */
  summary: AnomalySummary;
  /** Per-employee reputation records for display */
  reputations: ReputationRecord[];
  /** Whether a scan is currently running */
  scanning: boolean;
  /** Whether the IF model is still loading */
  modelLoading: boolean;
  /** Last error message */
  error: string | null;
  /** ID of the anomaly currently being resolved */
  resolving: string | null;
  /** How many scans have completed */
  scanCount: number;
  /** Whether auto-scan is enabled */
  autoScanEnabled: boolean;
  /** Seconds until next auto-scan */
  nextScanIn: number;
  /** Set of employee IDs currently blocked from withdrawing */
  blockedEmployeeIds: Set<string>;
  /** Check if a specific employee is blocked from withdrawing */
  isEmployeeBlocked: (employeeId: string) => boolean;
  /** Trigger a manual scan */
  runScan: () => Promise<void>;
  /** Resolve an anomaly (confirm or dismiss) */
  resolve: (id: string, resolution: "confirmed" | "review_dismissed") => Promise<void>;
  /** Toggle auto-scan on/off */
  setAutoScanEnabled: (enabled: boolean) => void;
  /** Get reputation score for an employee */
  getReputation: (empId: string) => number;
};

const AnomalyContext = createContext<AnomalyContextValue | null>(null);

/* ─── Provider ─── */

export function AnomalyProvider({ children }: { children: React.ReactNode }) {
  const { token, role } = useAuthSession();
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [scanning, setScanning] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [nextScanIn, setNextScanIn] = useState(AUTO_SCAN_INTERVAL_MS / 1000);
  const [blockedEmployeeIds, setBlockedEmployeeIds] = useState<Set<string>>(
    () => loadBlockedEmployees(),
  );

  // Reputation scores tracked client-side per employee id
  const reputationMap = useRef<Map<string, number>>(new Map());

  // Isolation Forest model reference (trained once)
  const forestRef = useRef<IsolationForest | null>(null);

  // Seen anomaly keys for deduplication
  const seenKeys = useRef<Set<string>>(new Set());

  // Track whether a scan is in progress (for the interval callback)
  const scanningRef = useRef(false);

  // Stable ref for scanCount inside runScan (avoids dependency loop)
  const scanCountRef = useRef(0);

  // Stable ref for runScan so the interval effect doesn't re-fire
  const runScanRef = useRef<(() => Promise<void>) | undefined>(undefined);

  /* Train the Isolation Forest on synthetic normal data on mount */
  useEffect(() => {
    const forest = new IsolationForest();
    const trainingData = generateNormalTrainingData(300);
    forest.fit(trainingData);
    forestRef.current = forest;
    setModelLoading(false);
  }, []);

  /* Reputation helpers */
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

  /* Update blocked employees from anomaly list */
  const updateBlockedEmployees = useCallback((allAnomalies: AnomalyRecord[]) => {
    const blocked = new Set<string>();
    for (const a of allAnomalies) {
      if (a.status === "pending_review" || a.status === "rebalance_triggered") {
        blocked.add(a.employeeId);
      }
    }
    setBlockedEmployeeIds(blocked);
    saveBlockedEmployees(blocked);
  }, []);

  const isEmployeeBlocked = useCallback(
    (employeeId: string) => blockedEmployeeIds.has(employeeId),
    [blockedEmployeeIds],
  );

  /* Derive reputations from the map for display */
  const reputations = useMemo((): ReputationRecord[] => {
    const empMap = new Map<
      string,
      { name: string; anomalyCount: number; confirmedCount: number }
    >();

    for (const a of anomalies) {
      const existing = empMap.get(a.employeeId) ?? {
        name: a.employeeName,
        anomalyCount: 0,
        confirmedCount: 0,
      };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalies, scanCount]);

  const summary = useMemo(
    () => buildSummary(anomalies, reputations),
    [anomalies, reputations],
  );

  /* ── Run Scan ── */
  const runScan = useCallback(async () => {
    if (!token) {
      setError("Sign in to scan live timecard data");
      return;
    }
    const forest = forestRef.current;
    if (!forest) {
      setError("Isolation Forest model not ready");
      return;
    }
    if (scanningRef.current) return; // Already scanning

    setScanning(true);
    scanningRef.current = true;
    setError(null);

    try {
      const [recipients, payRuns, schedules] = await Promise.all([
        api.getRecipients(token),
        api.getPayRuns(token),
        api.getSchedules(),
      ]);

      const allEntries: Array<{
        entry: RealTimeEntry;
        recipient: RealRecipient;
      }> = [];
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
            // skip
          }
        }),
      );

      if (allEntries.length === 0) {
        setError(
          "No completed time entries found — employees need to clock in/out first",
        );
        setScanning(false);
        scanningRef.current = false;
        return;
      }

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
        setError(
          `Could not extract features from ${allEntries.length} time entries. ${detail}`,
        );
        setScanning(false);
        scanningRef.current = false;
        return;
      }

      // Run through Isolation Forest
      const detections = forest.detect(
        featureData.map((d) => d.features),
        ANOMALY_SCORE_THRESHOLD,
      );

      // Convert detections to AnomalyRecords — deduplicate against previously seen
      const newAnomalies: AnomalyRecord[] = [];
      for (const det of detections) {
        const item = featureData[det.index];
        const key = anomalyKey(
          item.recipient.id,
          item.entry.date,
          item.entry.clockIn,
          item.entry.clockOut,
        );
        if (seenKeys.current.has(key)) continue; // Already reported this anomaly
        seenKeys.current.add(key);

        const empId = item.recipient.id;
        const repScore = getReputation(empId);
        const action =
          repScore < LOW_REPUTATION_THRESHOLD ? "usyc_rebalance" : "ceo_manual_review";
        const status =
          action === "usyc_rebalance" ? "rebalance_triggered" : "pending_review";
        const severity = scoreSeverity(det.score);
        const reasons = buildReasons(det.features, det.score, repScore);

        penaliseReputation(
          empId,
          action === "usyc_rebalance"
            ? REPUTATION_PENALTY_REBALANCE
            : REPUTATION_PENALTY_REVIEW,
        );

        newAnomalies.push({
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
              ? `0x${Array.from({ length: 64 }, () =>
                  Math.floor(Math.random() * 16).toString(16),
                ).join("")}`
              : null,
        });
      }

      // Recover reputation for employees whose entries were NOT flagged
      const flaggedIndices = new Set(detections.map((d) => d.index));
      for (let i = 0; i < featureData.length; i++) {
        if (!flaggedIndices.has(i)) {
          recoverReputation(featureData[i].recipient.id);
        }
      }

      if (newAnomalies.length === 0 && scanCountRef.current === 0) {
        setError(
          `Scanned ${featureData.length} time entries — no anomalies detected. All clear!`,
        );
      } else if (newAnomalies.length === 0) {
        // Subsequent scans: no new anomalies
        setError(null);
      } else {
        setError(null);
      }

      setAnomalies((prev) => {
        const updated = [...newAnomalies, ...prev];
        updateBlockedEmployees(updated);
        return updated;
      });
      scanCountRef.current += 1;
      setScanCount(scanCountRef.current);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Scan failed — could not reach backend",
      );
    } finally {
      setScanning(false);
      scanningRef.current = false;
    }
  }, [
    token,
    getReputation,
    penaliseReputation,
    recoverReputation,
    updateBlockedEmployees,
  ]);

  // Keep the ref in sync so the interval always calls the latest version
  useEffect(() => {
    runScanRef.current = runScan;
  }, [runScan]);

  /* Resolve anomaly locally */
  const resolve = useCallback(
    async (id: string, resolution: "confirmed" | "review_dismissed") => {
      setResolving(id);
      await new Promise((r) => setTimeout(r, 400));
      setAnomalies((prev) => {
        const updated = prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status: resolution,
                resolvedAt: new Date().toISOString(),
                resolvedBy: "ceo",
              }
            : a,
        );
        updateBlockedEmployees(updated);
        return updated;
      });
      setResolving(null);
    },
    [updateBlockedEmployees],
  );

  /* ── Auto-scan interval ── */
  useEffect(() => {
    if (!autoScanEnabled || role !== "admin" || !token || modelLoading) return;

    // Countdown timer (visual only)
    const countdownId = setInterval(() => {
      setNextScanIn((prev) => {
        if (prev <= 1) return AUTO_SCAN_INTERVAL_MS / 1000;
        return prev - 1;
      });
    }, 1000);

    // Actual scan interval — uses the stable ref to avoid re-triggering
    const scanId = setInterval(() => {
      void runScanRef.current?.();
      setNextScanIn(AUTO_SCAN_INTERVAL_MS / 1000);
    }, AUTO_SCAN_INTERVAL_MS);

    // Run first scan immediately
    void runScanRef.current?.();

    return () => {
      clearInterval(countdownId);
      clearInterval(scanId);
    };
  }, [autoScanEnabled, role, token, modelLoading]);

  const value = useMemo<AnomalyContextValue>(
    () => ({
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
      isEmployeeBlocked,
      runScan,
      resolve,
      setAutoScanEnabled,
      getReputation,
    }),
    [
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
      isEmployeeBlocked,
      runScan,
      resolve,
      getReputation,
    ],
  );

  return (
    <AnomalyContext.Provider value={value}>{children}</AnomalyContext.Provider>
  );
}

/* ─── Hook ─── */

export function useAnomalyDetection() {
  const ctx = useContext(AnomalyContext);
  if (!ctx)
    throw new Error("useAnomalyDetection must be used within AnomalyProvider");
  return ctx;
}
