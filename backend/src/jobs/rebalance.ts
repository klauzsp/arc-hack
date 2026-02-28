/**
 * Auto-rebalance job.
 *
 * Runs periodically:
 * 1. If Core USDC > idle threshold and no pending pay run in next N hours,
 *    call Rebalance.usdcToUsyc to earn yield.
 * 2. Before pay run execution (triggered by pay run route), ensure liquidity
 *    by redeeming USYC → USDC.
 *
 * For the hackathon, this is a simple setInterval-based job.
 * In production, use a proper job scheduler (bull, cron, etc.).
 */
import { queryOne } from "../db/connection.js";
import { config } from "../config.js";
import { getTreasuryUsdcBalance } from "../services/chain.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startRebalanceJob() {
  console.log("🔄 Auto-rebalance job started (interval: 1h)");

  const run = async () => {
    try {
      // Check for pending/approved pay runs in the next N hours
      const bufferMs = config.rebalance.bufferHours * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() + bufferMs).toISOString();

      const pendingRun = queryOne(
        `SELECT id FROM pay_run
         WHERE status IN ('approved', 'pending')
         AND period_end <= ?
         LIMIT 1`,
        [cutoff]
      );

      if (pendingRun) {
        console.log("⏳ Pending pay run found — skipping idle → USYC rebalance");
        return;
      }

      // Check treasury USDC balance
      let usdcBalance: bigint;
      try {
        usdcBalance = await getTreasuryUsdcBalance();
      } catch {
        // Chain not reachable
        return;
      }

      if (usdcBalance > config.rebalance.idleThreshold) {
        const excess = usdcBalance - config.rebalance.idleThreshold;
        console.log(
          `💰 Idle USDC (${usdcBalance}) exceeds threshold (${config.rebalance.idleThreshold}). ` +
          `Would rebalance ${excess} to USYC.`
        );
        // In production: call walletClient.writeContract for Rebalance.usdcToUsyc(excess)
        // For hackathon, just log the intent.
      }
    } catch (err) {
      console.error("Rebalance job error:", err);
    }
  };

  // Run immediately, then on interval
  run();
  setInterval(run, INTERVAL_MS);
}
