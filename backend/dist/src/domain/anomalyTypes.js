"use strict";
/** Anomaly detection agent types */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANOMALY_SCORE_THRESHOLD = exports.REPUTATION_RECOVERY_PER_CLEAN = exports.REPUTATION_PENALTY_PER_ANOMALY = exports.DEFAULT_REPUTATION_SCORE = exports.HIGH_REPUTATION_THRESHOLD = exports.LOW_REPUTATION_THRESHOLD = void 0;
/** Low reputation threshold — below this triggers automatic USYC rebalance */
exports.LOW_REPUTATION_THRESHOLD = 40;
/** High reputation threshold — above this triggers CEO manual review instead */
exports.HIGH_REPUTATION_THRESHOLD = 60;
/** Default initial reputation score for new employees */
exports.DEFAULT_REPUTATION_SCORE = 75;
/** How much reputation drops per detected anomaly */
exports.REPUTATION_PENALTY_PER_ANOMALY = 8;
/** How much reputation recovers per clean scan (capped at 100) */
exports.REPUTATION_RECOVERY_PER_CLEAN = 2;
/** Anomaly score threshold from isolation forest (above = anomalous) */
exports.ANOMALY_SCORE_THRESHOLD = 0.55;
