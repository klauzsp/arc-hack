import { Router, Response } from "express";
import { v4 as uuid } from "uuid";
import { queryAll, queryOne, runSql } from "../db/connection.js";
import { type AuthRequest, requireAuth } from "../middleware/auth.js";

const router = Router();

// ── POST /time/clock-in ────────────────────────────────────────────
router.post("/clock-in", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employee = findEmployeeByWallet(req.wallet!);
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(11, 16); // HH:MM

  const open = queryOne(
    "SELECT id FROM time_entry WHERE employee_id = ? AND date = ? AND clock_out IS NULL",
    [employee.id, today]
  );
  if (open) return res.status(400).json({ error: "Already clocked in" });

  const id = uuid();
  runSql(
    "INSERT INTO time_entry (id, employee_id, date, clock_in) VALUES (?, ?, ?, ?)",
    [id, employee.id, today, now]
  );

  res.status(201).json({ id, date: today, clockIn: now });
});

// ── POST /time/clock-out ───────────────────────────────────────────
router.post("/clock-out", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employee = findEmployeeByWallet(req.wallet!);
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(11, 16);

  const open = queryOne<{ id: string }>(
    "SELECT id FROM time_entry WHERE employee_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1",
    [employee.id, today]
  );
  if (!open) return res.status(400).json({ error: "No open clock-in for today" });

  runSql("UPDATE time_entry SET clock_out = ? WHERE id = ?", [now, open.id]);
  res.json({ id: open.id, clockOut: now });
});

// ── GET /time/entries (own or admin) ───────────────────────────────
router.get("/entries", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employeeId = req.query.employeeId as string | undefined;

  let targetId: string;
  if (req.role === "admin" && employeeId) {
    targetId = employeeId;
  } else {
    const emp = findEmployeeByWallet(req.wallet!);
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    targetId = emp.id;
  }

  const rows = queryAll(
    `SELECT id, date, clock_in as clockIn, clock_out as clockOut
     FROM time_entry WHERE employee_id = ? ORDER BY date DESC, clock_in DESC`,
    [targetId]
  );
  res.json(rows);
});

// ── GET /time/schedule ─────────────────────────────────────────────
router.get("/schedule", requireAuth as any, (req: AuthRequest, res: Response) => {
  const employee = findEmployeeByWallet(req.wallet!);
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  if (!employee.schedule_id) {
    return res.json({ workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8 });
  }
  const schedule = queryOne("SELECT * FROM schedule WHERE id = ?", [employee.schedule_id]) as any;
  res.json({
    workingDays: JSON.parse(schedule.working_days),
    hoursPerDay: schedule.hours_per_day,
    timezone: schedule.timezone,
  });
});

// ── GET /time/holidays ─────────────────────────────────────────────
router.get("/holidays", requireAuth as any, (_req: AuthRequest, res: Response) => {
  const rows = queryAll(
    "SELECT date, name FROM holiday WHERE company_id = 'default' ORDER BY date"
  );
  res.json(rows);
});

// ── Helper ─────────────────────────────────────────────────────────
function findEmployeeByWallet(wallet: string) {
  return queryOne("SELECT * FROM employee WHERE LOWER(wallet_address) = ?", [wallet.toLowerCase()]) as any | undefined;
}

export default router;
