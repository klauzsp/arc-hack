import { Router, Response } from "express";
import { type AuthRequest, requireAuth } from "../middleware/auth.js";
import { queryOne } from "../db/connection.js";
import { computeEarnings } from "../services/earnings.js";

const router = Router();

// ── GET /earnings/me ───────────────────────────────────────────────
router.get("/me", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employee = queryOne(
    `SELECT id, wallet_address as walletAddress, name, pay_type as payType, rate,
            chain_preference as chainPreference, schedule_id as scheduleId,
            time_tracking_mode as timeTrackingMode
     FROM employee WHERE LOWER(wallet_address) = ?`,
    [req.wallet!.toLowerCase()]
  ) as any;

  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const periodStart = (req.query.periodStart as string) || undefined;
  const asOf = (req.query.asOf as string) || undefined;
  const earnings = computeEarnings(employee.id, periodStart, asOf);

  res.json({ ...employee, ...earnings });
});

// ── GET /earnings/:employeeId (admin) ──────────────────────────────
router.get("/:employeeId", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employee = queryOne(
    `SELECT id, wallet_address as walletAddress, name, pay_type as payType, rate,
            chain_preference as chainPreference, schedule_id as scheduleId,
            time_tracking_mode as timeTrackingMode
     FROM employee WHERE id = ?`,
    [req.params.employeeId]
  ) as any;

  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const periodStart = (req.query.periodStart as string) || undefined;
  const asOf = (req.query.asOf as string) || undefined;
  const earnings = computeEarnings(employee.id, periodStart, asOf);

  res.json({ ...employee, ...earnings });
});

export default router;
