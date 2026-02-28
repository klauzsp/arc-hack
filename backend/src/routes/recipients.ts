import { Router, Response } from "express";
import { v4 as uuid } from "uuid";
import { queryAll, queryOne, runSql } from "../db/connection.js";
import { type AuthRequest, requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

// ── List recipients (admin) ────────────────────────────────────────
router.get("/", requireAuth as any, (_req: AuthRequest, res: Response) => {
  const rows = queryAll(
    `SELECT id, wallet_address as walletAddress, name, pay_type as payType, rate,
            chain_preference as chainPreference, schedule_id as scheduleId,
            time_tracking_mode as timeTrackingMode, role
     FROM employee WHERE company_id = ? ORDER BY name`,
    ["default"]
  );
  res.json(rows);
});

// ── Get single recipient ───────────────────────────────────────────
router.get("/:id", requireAuth as any, (req: AuthRequest, res: Response) => {
  const row = queryOne(
    `SELECT id, wallet_address as walletAddress, name, pay_type as payType, rate,
            chain_preference as chainPreference, schedule_id as scheduleId,
            time_tracking_mode as timeTrackingMode, role
     FROM employee WHERE id = ?`,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// ── Create recipient (admin) ───────────────────────────────────────
router.post("/", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const {
    walletAddress,
    name,
    payType = "yearly",
    rate = 0,
    chainPreference = "Arc",
    scheduleId = null,
    timeTrackingMode = "schedule_based",
    role = "employee",
  } = req.body;

  if (!walletAddress || !name) {
    return res.status(400).json({ error: "walletAddress and name required" });
  }

  const id = uuid();
  runSql(
    `INSERT INTO employee (id, company_id, wallet_address, name, pay_type, rate,
       chain_preference, schedule_id, time_tracking_mode, role)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, walletAddress, name, payType, rate, chainPreference, scheduleId, timeTrackingMode, role]
  );
  res.status(201).json({ id });
});

// ── Update recipient (admin) ───────────────────────────────────────
router.put("/:id", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const existing = queryOne("SELECT id FROM employee WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { name, payType, rate, chainPreference, scheduleId, timeTrackingMode, role } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
  if (payType !== undefined) { sets.push("pay_type = ?"); vals.push(payType); }
  if (rate !== undefined) { sets.push("rate = ?"); vals.push(rate); }
  if (chainPreference !== undefined) { sets.push("chain_preference = ?"); vals.push(chainPreference); }
  if (scheduleId !== undefined) { sets.push("schedule_id = ?"); vals.push(scheduleId); }
  if (timeTrackingMode !== undefined) { sets.push("time_tracking_mode = ?"); vals.push(timeTrackingMode); }
  if (role !== undefined) { sets.push("role = ?"); vals.push(role); }

  if (sets.length === 0) return res.json({ ok: true });
  vals.push(req.params.id);
  runSql(`UPDATE employee SET ${sets.join(", ")} WHERE id = ?`, vals);
  res.json({ ok: true });
});

// ── Delete recipient (admin) ───────────────────────────────────────
router.delete("/:id", requireAdmin as any, (req: AuthRequest, res: Response) => {
  runSql("DELETE FROM employee WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
