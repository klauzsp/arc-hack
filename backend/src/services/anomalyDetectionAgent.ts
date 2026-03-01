/**
 * Anomaly Detection Agent
 *
 * Orchestrates the full anomaly-detection pipeline:
 *   1. Extract features from recent timecard entries
 *   2. Fit an Isolation Forest on historical (normal) data
 *   3. Score recent entries and flag anomalies
 *   4. Cross-reference with Stork Oracle reputation score
 *   5. Decide action: USYC rebalance (low rep) or CEO manual review (high rep)
 *   6. Persist anomaly records and update reputation scores
 */

import {
  ANOMALY_SCORE_THRESHOLD,
  type AnomalyDetectionResult,
  type AnomalyFeatures,
  type AnomalyRecord,
  type AnomalySeverity,
  type AnomalySummary,
} from "../domain/anomalyTypes";
import type {
  EmployeeRecord,
  PayRunRecord,
  ScheduleRecord,
  TimeEntryRecord,
} from "../domain/types";
import { IsolationForest } from "../lib/isolationForest";
import { currentSemimonthlyPeriod, hoursBetween, parseIsoDate } from "../lib/dates";
import { createId } from "../lib/ids";
import { nowIso } from "../lib/dates";
import { StorkOracleService } from "./storkOracleService";
import type { PayrollService } from "./payrollService";

// ── Feature extraction ──────────────────────────────────────────────────────

function occupationTypeFromPayType(payType: string): number {
  switch (payType) {
    case "yearly":
      return 0;
    case "daily":
      return 1;
    case "hourly":
      return 2;
    default:
      return 1;
  }
}

function clockToFractionalHour(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours + minutes / 60;
}

function daysBetweenDates(a: string, b: string): number {
  const dateA = parseIsoDate(a);
  const dateB = parseIsoDate(b);
  return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
}

function severityFromScore(score: number): AnomalySeverity {
  if (score >= 0.85) return "critical";
  if (score >= 0.75) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

function buildReasons(features: AnomalyFeatures, score: number, scheduleStart: number): string[] {
  const reasons: string[] = [];

  // Duration anomalies
  if (features.durationHours > 12) {
    reasons.push(`Unusually long shift: ${features.durationHours.toFixed(1)}h`);
  }
  if (features.durationHours < 1 && features.durationHours > 0) {
    reasons.push(`Suspiciously short shift: ${features.durationHours.toFixed(1)}h`);
  }

  // Time of day
  if (features.clockInHour < 5 || features.clockInHour > 22) {
    reasons.push(`Unusual clock-in time: ${Math.floor(features.clockInHour)}:${String(Math.round((features.clockInHour % 1) * 60)).padStart(2, "0")}`);
  }

  // Weekend
  if (features.isWeekend) {
    reasons.push("Entry logged on a weekend");
  }

  // Pay-day proximity
  if (features.daysSincePayDay <= 1) {
    reasons.push(`Entry very close to pay day (${features.daysSincePayDay}d after)`);
  }
  if (features.daysUntilPayDay <= 1) {
    reasons.push(`Entry very close to upcoming pay day (${features.daysUntilPayDay}d before)`);
  }

  // Schedule deviation
  if (Math.abs(features.scheduleDeviation) > 2) {
    reasons.push(`${features.scheduleDeviation > 0 ? "Late" : "Early"} by ${Math.abs(features.scheduleDeviation).toFixed(1)}h vs schedule`);
  }

  if (reasons.length === 0) {
    reasons.push(`Isolation Forest anomaly score: ${score.toFixed(3)}`);
  }

  return reasons;
}

// ── Agent ────────────────────────────────────────────────────────────────────

export class AnomalyDetectionAgent {
  private forest = new IsolationForest();
  private anomalies: AnomalyRecord[] = [];

  constructor(
    private readonly storkOracle: StorkOracleService,
  ) {}

  /**
   * Run the anomaly detection scan across all employees with time entries.
   *
   * @param employees    All employee records
   * @param timeEntries  All time entries (recent window)
   * @param payRuns      All pay runs (to compute pay-day distances)
   * @param schedules    All schedules
   * @param companyId    Company identifier
   * @param today        Reference date (ISO)
   */
  scan(
    employees: EmployeeRecord[],
    timeEntries: TimeEntryRecord[],
    payRuns: PayRunRecord[],
    schedules: ScheduleRecord[],
    companyId: string,
    today: string,
  ): AnomalyDetectionResult {
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

    // Compute last & next pay day
    const executedPayRuns = payRuns
      .filter((pr) => pr.status === "executed")
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
    const lastPayDate = executedPayRuns[0]?.periodEnd ?? today;
    const { periodEnd: nextPayDate } = currentSemimonthlyPeriod(today);

    // Build feature vectors for all completed time entries
    const entryFeatures: Array<{
      entry: TimeEntryRecord;
      employee: EmployeeRecord;
      features: AnomalyFeatures;
    }> = [];

    for (const entry of timeEntries) {
      if (!entry.clockOut) continue; // skip open entries

      const employee = employeeMap.get(entry.employeeId);
      if (!employee) continue;

      const schedule = scheduleMap.get(employee.scheduleId ?? "");
      const scheduledStartHour = schedule
        ? clockToFractionalHour(schedule.startTime)
        : 9;

      const clockInHour = clockToFractionalHour(entry.clockIn);
      const clockOutHour = clockToFractionalHour(entry.clockOut);
      const durationHours = hoursBetween(entry.clockIn, entry.clockOut);
      const daysSincePayDay = Math.max(0, daysBetweenDates(lastPayDate, entry.date));
      const daysUntilPayDay = Math.max(0, daysBetweenDates(entry.date, nextPayDate));
      const date = parseIsoDate(entry.date);
      const dayOfWeek = date.getUTCDay();

      const features: AnomalyFeatures = {
        clockInHour,
        clockOutHour,
        durationHours,
        daysSincePayDay,
        daysUntilPayDay,
        occupationType: occupationTypeFromPayType(employee.payType),
        rateCents: employee.rateCents,
        dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        scheduleDeviation: clockInHour - scheduledStartHour,
      };

      entryFeatures.push({ entry, employee, features });
    }

    if (entryFeatures.length === 0) {
      return {
        anomalies: [],
        scannedEntries: 0,
        totalAnomalies: 0,
        rebalanceTriggered: 0,
        reviewTriggered: 0,
      };
    }

    // Fit forest on all data (in production, fit on historical normal data)
    const allFeatures = entryFeatures.map((ef) => ef.features);
    this.forest.fit(allFeatures);

    // Detect anomalies
    const detected = this.forest.detect(allFeatures, ANOMALY_SCORE_THRESHOLD);

    const newAnomalies: AnomalyRecord[] = [];
    let rebalanceTriggered = 0;
    let reviewTriggered = 0;

    for (const { index, score, features } of detected) {
      const { entry, employee } = entryFeatures[index];

      // Penalise reputation via Stork Oracle
      const reputation = this.storkOracle.penalise(employee.id);
      const action = this.storkOracle.decideAction(employee.id);

      const schedule = scheduleMap.get(employee.scheduleId ?? "");
      const scheduledStart = schedule ? clockToFractionalHour(schedule.startTime) : 9;

      const anomaly: AnomalyRecord = {
        id: createId("anomaly"),
        employeeId: employee.id,
        employeeName: employee.name,
        companyId,
        detectedAt: nowIso(),
        severity: severityFromScore(score),
        status: action === "usyc_rebalance" ? "rebalance_triggered" : "pending_review",
        action,
        anomalyScore: Math.round(score * 1000) / 1000,
        reputationScore: reputation.score,
        features,
        reasons: buildReasons(features, score, scheduledStart),
        resolvedAt: null,
        resolvedBy: null,
        rebalanceTxHash: null,
      };

      newAnomalies.push(anomaly);

      if (action === "usyc_rebalance") {
        rebalanceTriggered++;
      } else {
        reviewTriggered++;
      }
    }

    // Recover reputation for employees with no anomalies in this scan
    const anomalousEmployeeIds = new Set(newAnomalies.map((a) => a.employeeId));
    for (const employee of employees) {
      if (!anomalousEmployeeIds.has(employee.id)) {
        this.storkOracle.recover(employee.id);
      }
    }

    this.anomalies.push(...newAnomalies);

    return {
      anomalies: newAnomalies,
      scannedEntries: entryFeatures.length,
      totalAnomalies: newAnomalies.length,
      rebalanceTriggered,
      reviewTriggered,
    };
  }

  /** Get all detected anomalies (optionally filtered). */
  getAnomalies(filter?: { employeeId?: string; status?: string }): AnomalyRecord[] {
    let results = [...this.anomalies];
    if (filter?.employeeId) {
      results = results.filter((a) => a.employeeId === filter.employeeId);
    }
    if (filter?.status) {
      results = results.filter((a) => a.status === filter.status);
    }
    return results.sort((a, b) => (a.detectedAt > b.detectedAt ? -1 : 1));
  }

  /** Resolve an anomaly (CEO reviewed). */
  resolveAnomaly(
    anomalyId: string,
    resolution: "confirmed" | "review_dismissed",
    resolvedBy: string,
  ): AnomalyRecord | null {
    const anomaly = this.anomalies.find((a) => a.id === anomalyId);
    if (!anomaly) return null;

    anomaly.status = resolution;
    anomaly.resolvedAt = nowIso();
    anomaly.resolvedBy = resolvedBy;

    if (resolution === "confirmed") {
      this.storkOracle.confirmAnomaly(anomaly.employeeId);
    }

    return { ...anomaly };
  }

  /** Set rebalance tx hash after a USYC rebalance is triggered. */
  setRebalanceTxHash(anomalyId: string, txHash: string): void {
    const anomaly = this.anomalies.find((a) => a.id === anomalyId);
    if (anomaly) {
      anomaly.rebalanceTxHash = txHash;
    }
  }

  /** Get summary stats. */
  getSummary(): AnomalySummary {
    const all = this.anomalies;
    const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    let totalReputation = 0;
    const employeeIds = new Set<string>();

    for (const a of all) {
      bySeverity[a.severity]++;
      employeeIds.add(a.employeeId);
    }

    for (const id of employeeIds) {
      totalReputation += this.storkOracle.getReputation(id).score;
    }

    return {
      totalAnomalies: all.length,
      pendingReview: all.filter((a) => a.status === "pending_review").length,
      rebalancesTriggered: all.filter((a) => a.status === "rebalance_triggered").length,
      avgReputationScore: employeeIds.size > 0 ? Math.round(totalReputation / employeeIds.size) : 100,
      bySeverity,
      recentAnomalies: all.sort((a, b) => (a.detectedAt > b.detectedAt ? -1 : 1)).slice(0, 20),
    };
  }
}
