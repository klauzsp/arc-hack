import { Router, Response } from "express";
import { queryAll, queryOne } from "../db/connection.js";
import { type AuthRequest, requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /dashboard ─────────────────────────────────────────────────
router.get("/", requireAuth as any, (req: AuthRequest, res: Response) => {
  const companyId = "default";

  const totalRecipients = (
    queryOne("SELECT COUNT(*) as c FROM employee WHERE company_id = ?", [companyId]) as any
  ).c;

  const salaried = (
    queryOne("SELECT COUNT(*) as c FROM employee WHERE company_id = ? AND pay_type = 'yearly'", [companyId]) as any
  ).c;

  const pendingPayRun = queryOne(
    `SELECT id, period_start as periodStart, period_end as periodEnd,
            status, total_amount as totalAmount, recipient_count as recipientCount
     FROM pay_run WHERE company_id = ? AND status IN ('approved','pending','draft')
     ORDER BY created_at DESC LIMIT 1`,
    [companyId]
  );

  const recentPayRuns = queryAll(
    `SELECT id, period_start as periodStart, period_end as periodEnd,
            status, total_amount as totalAmount, recipient_count as recipientCount,
            tx_hash as txHash, executed_at as executedAt
     FROM pay_run WHERE company_id = ?
     ORDER BY created_at DESC LIMIT 5`,
    [companyId]
  );

  const totalPaidOut = (
    queryOne(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM pay_run WHERE company_id = ? AND status = 'executed'`,
      [companyId]
    ) as any
  ).total;

  res.json({
    totalRecipients,
    salaried,
    hourlyOrDaily: totalRecipients - salaried,
    pendingPayRun,
    recentPayRuns,
    totalPaidOut,
  });
});

export default router;
