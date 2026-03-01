/**
 * Stork Oracle reputation service.
 *
 * In production this would query the Stork Oracle on-chain feed for each
 * employee's reputation score. For the prototype we maintain an in-memory /
 * SQLite-backed score per employee, initialised at 75 and adjusted as the
 * anomaly-detection agent runs:
 *
 *   • Anomaly detected  → score -= REPUTATION_PENALTY_PER_ANOMALY
 *   • Clean scan         → score += REPUTATION_RECOVERY_PER_CLEAN (capped at 100)
 *
 * The score determines which action is taken when an anomaly fires:
 *   • score < LOW_REPUTATION_THRESHOLD  → automatic USYC rebalance
 *   • score >= HIGH_REPUTATION_THRESHOLD → CEO manual review
 *   • between thresholds                → CEO manual review (benefit of doubt)
 */

import {
  DEFAULT_REPUTATION_SCORE,
  LOW_REPUTATION_THRESHOLD,
  HIGH_REPUTATION_THRESHOLD,
  REPUTATION_PENALTY_PER_ANOMALY,
  REPUTATION_RECOVERY_PER_CLEAN,
  type AnomalyAction,
  type ReputationRecord,
} from "../domain/anomalyTypes";
import { nowIso } from "../lib/dates";

export class StorkOracleService {
  /** In-memory store — keyed by employeeId */
  private reputations = new Map<string, ReputationRecord>();

  /** Get or initialise the reputation record for an employee. */
  getReputation(employeeId: string): ReputationRecord {
    let record = this.reputations.get(employeeId);
    if (!record) {
      record = {
        employeeId,
        score: DEFAULT_REPUTATION_SCORE,
        lastUpdated: nowIso(),
        anomalyCount: 0,
        confirmedAnomalyCount: 0,
      };
      this.reputations.set(employeeId, record);
    }
    return { ...record };
  }

  /** Bulk-get reputations. Initialises missing entries. */
  getReputations(employeeIds: string[]): ReputationRecord[] {
    return employeeIds.map((id) => this.getReputation(id));
  }

  /** Apply penalty when an anomaly is detected. */
  penalise(employeeId: string): ReputationRecord {
    const record = this.getOrInit(employeeId);
    record.score = Math.max(0, record.score - REPUTATION_PENALTY_PER_ANOMALY);
    record.anomalyCount += 1;
    record.lastUpdated = nowIso();
    this.reputations.set(employeeId, record);
    return { ...record };
  }

  /** Small recovery when scan is clean for this employee. */
  recover(employeeId: string): ReputationRecord {
    const record = this.getOrInit(employeeId);
    record.score = Math.min(100, record.score + REPUTATION_RECOVERY_PER_CLEAN);
    record.lastUpdated = nowIso();
    this.reputations.set(employeeId, record);
    return { ...record };
  }

  /** Mark confirmed anomaly (CEO verified). */
  confirmAnomaly(employeeId: string): ReputationRecord {
    const record = this.getOrInit(employeeId);
    record.confirmedAnomalyCount += 1;
    record.score = Math.max(0, record.score - REPUTATION_PENALTY_PER_ANOMALY);
    record.lastUpdated = nowIso();
    this.reputations.set(employeeId, record);
    return { ...record };
  }

  /** Decide action based on current reputation. */
  decideAction(employeeId: string): AnomalyAction {
    const record = this.getOrInit(employeeId);
    if (record.score < LOW_REPUTATION_THRESHOLD) {
      return "usyc_rebalance";
    }
    return "ceo_manual_review";
  }

  /** Bulk-load reputations (e.g. on startup from DB). */
  load(records: ReputationRecord[]): void {
    for (const record of records) {
      this.reputations.set(record.employeeId, { ...record });
    }
  }

  /** Export all reputations (for persistence). */
  export(): ReputationRecord[] {
    return [...this.reputations.values()].map((r) => ({ ...r }));
  }

  // ── Private ──

  private getOrInit(employeeId: string): ReputationRecord {
    let record = this.reputations.get(employeeId);
    if (!record) {
      record = {
        employeeId,
        score: DEFAULT_REPUTATION_SCORE,
        lastUpdated: nowIso(),
        anomalyCount: 0,
        confirmedAnomalyCount: 0,
      };
      this.reputations.set(employeeId, record);
    }
    return record;
  }
}
