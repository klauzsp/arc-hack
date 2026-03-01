"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorkOracleService = void 0;
const anomalyTypes_1 = require("../domain/anomalyTypes");
const dates_1 = require("../lib/dates");
class StorkOracleService {
    /** In-memory store — keyed by employeeId */
    reputations = new Map();
    /** Get or initialise the reputation record for an employee. */
    getReputation(employeeId) {
        let record = this.reputations.get(employeeId);
        if (!record) {
            record = {
                employeeId,
                score: anomalyTypes_1.DEFAULT_REPUTATION_SCORE,
                lastUpdated: (0, dates_1.nowIso)(),
                anomalyCount: 0,
                confirmedAnomalyCount: 0,
            };
            this.reputations.set(employeeId, record);
        }
        return { ...record };
    }
    /** Bulk-get reputations. Initialises missing entries. */
    getReputations(employeeIds) {
        return employeeIds.map((id) => this.getReputation(id));
    }
    /** Apply penalty when an anomaly is detected. */
    penalise(employeeId) {
        const record = this.getOrInit(employeeId);
        record.score = Math.max(0, record.score - anomalyTypes_1.REPUTATION_PENALTY_PER_ANOMALY);
        record.anomalyCount += 1;
        record.lastUpdated = (0, dates_1.nowIso)();
        this.reputations.set(employeeId, record);
        return { ...record };
    }
    /** Small recovery when scan is clean for this employee. */
    recover(employeeId) {
        const record = this.getOrInit(employeeId);
        record.score = Math.min(100, record.score + anomalyTypes_1.REPUTATION_RECOVERY_PER_CLEAN);
        record.lastUpdated = (0, dates_1.nowIso)();
        this.reputations.set(employeeId, record);
        return { ...record };
    }
    /** Mark confirmed anomaly (CEO verified). */
    confirmAnomaly(employeeId) {
        const record = this.getOrInit(employeeId);
        record.confirmedAnomalyCount += 1;
        record.score = Math.max(0, record.score - anomalyTypes_1.REPUTATION_PENALTY_PER_ANOMALY);
        record.lastUpdated = (0, dates_1.nowIso)();
        this.reputations.set(employeeId, record);
        return { ...record };
    }
    /** Decide action based on current reputation. */
    decideAction(employeeId) {
        const record = this.getOrInit(employeeId);
        if (record.score < anomalyTypes_1.LOW_REPUTATION_THRESHOLD) {
            return "usyc_rebalance";
        }
        return "ceo_manual_review";
    }
    /** Bulk-load reputations (e.g. on startup from DB). */
    load(records) {
        for (const record of records) {
            this.reputations.set(record.employeeId, { ...record });
        }
    }
    /** Export all reputations (for persistence). */
    export() {
        return [...this.reputations.values()].map((r) => ({ ...r }));
    }
    // ── Private ──
    getOrInit(employeeId) {
        let record = this.reputations.get(employeeId);
        if (!record) {
            record = {
                employeeId,
                score: anomalyTypes_1.DEFAULT_REPUTATION_SCORE,
                lastUpdated: (0, dates_1.nowIso)(),
                anomalyCount: 0,
                confirmedAnomalyCount: 0,
            };
            this.reputations.set(employeeId, record);
        }
        return record;
    }
}
exports.StorkOracleService = StorkOracleService;
