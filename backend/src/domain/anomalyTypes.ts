/** Anomaly detection agent types */

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyStatus = "detected" | "pending_review" | "rebalance_triggered" | "review_dismissed" | "confirmed";
export type AnomalyAction = "usyc_rebalance" | "ceo_manual_review";

export interface AnomalyRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  detectedAt: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  action: AnomalyAction;
  anomalyScore: number; // 0-1, from Isolation Forest
  reputationScore: number; // 0-100, from Stork Oracle
  features: AnomalyFeatures;
  reasons: string[];
  resolvedAt: string | null;
  resolvedBy: string | null;
  rebalanceTxHash: string | null;
}

export interface AnomalyFeatures {
  /** Clock-in hour (0-23 fractional) */
  clockInHour: number;
  /** Clock-out hour (0-23 fractional) */
  clockOutHour: number;
  /** Duration of shift in hours */
  durationHours: number;
  /** Days since last pay day */
  daysSincePayDay: number;
  /** Days until next pay day */
  daysUntilPayDay: number;
  /** Occupation encoded as numeric (payType: yearly=0, daily=1, hourly=2) */
  occupationType: number;
  /** Pay rate in cents */
  rateCents: number;
  /** Day of week (0-6) */
  dayOfWeek: number;
  /** Whether the entry is on a weekend */
  isWeekend: boolean;
  /** Hour deviation from scheduled start */
  scheduleDeviation: number;
}

export interface ReputationRecord {
  employeeId: string;
  score: number; // 0 - 100
  lastUpdated: string;
  anomalyCount: number;
  confirmedAnomalyCount: number;
}

export interface AnomalyDetectionResult {
  anomalies: AnomalyRecord[];
  scannedEntries: number;
  totalAnomalies: number;
  rebalanceTriggered: number;
  reviewTriggered: number;
}

export interface AnomalySummary {
  totalAnomalies: number;
  pendingReview: number;
  rebalancesTriggered: number;
  avgReputationScore: number;
  bySeverity: Record<AnomalySeverity, number>;
  recentAnomalies: AnomalyRecord[];
}

/** Low reputation threshold — below this triggers automatic USYC rebalance */
export const LOW_REPUTATION_THRESHOLD = 40;

/** High reputation threshold — above this triggers CEO manual review instead */
export const HIGH_REPUTATION_THRESHOLD = 60;

/** Default initial reputation score for new employees */
export const DEFAULT_REPUTATION_SCORE = 75;

/** How much reputation drops per detected anomaly */
export const REPUTATION_PENALTY_PER_ANOMALY = 8;

/** How much reputation recovers per clean scan (capped at 100) */
export const REPUTATION_RECOVERY_PER_CLEAN = 2;

/** Anomaly score threshold from isolation forest (above = anomalous) */
export const ANOMALY_SCORE_THRESHOLD = 0.55;
