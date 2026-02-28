import { Router, Response } from "express";
import { v4 as uuid } from "uuid";
import { queryAll, queryOne, runSql } from "../db/connection.js";
import { type AuthRequest, requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

// ── List policies ──────────────────────────────────────────────────
router.get("/", requireAuth as any, (_req: AuthRequest, res: Response) => {
  const rows = queryAll(
    `SELECT id, name, type, config, enabled, created_at as createdAt
     FROM policy WHERE company_id = 'default' ORDER BY created_at DESC`
  ).map((r: any) => ({ ...r, config: JSON.parse(r.config), enabled: !!r.enabled }));
  res.json(rows);
});

// ── Get single policy ──────────────────────────────────────────────
router.get("/:id", requireAuth as any, (req: AuthRequest, res: Response) => {
  const row = queryOne(
    "SELECT id, name, type, config, enabled, created_at as createdAt FROM policy WHERE id = ?",
    [req.params.id]
  ) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, config: JSON.parse(row.config), enabled: !!row.enabled });
});

// ── Create policy ──────────────────────────────────────────────────
router.post("/", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const { name, type = "scheduled", config: cfg = {}, enabled = true } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const id = uuid();
  runSql(
    "INSERT INTO policy (id, company_id, name, type, config, enabled) VALUES (?, 'default', ?, ?, ?, ?)",
    [id, name, type, JSON.stringify(cfg), enabled ? 1 : 0]
  );
  res.status(201).json({ id });
});

// ── Update policy ──────────────────────────────────────────────────
router.put("/:id", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const { name, type, config: cfg, enabled } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
  if (type !== undefined) { sets.push("type = ?"); vals.push(type); }
  if (cfg !== undefined) { sets.push("config = ?"); vals.push(JSON.stringify(cfg)); }
  if (enabled !== undefined) { sets.push("enabled = ?"); vals.push(enabled ? 1 : 0); }

  if (sets.length === 0) return res.json({ ok: true });
  vals.push(req.params.id);
  runSql(`UPDATE policy SET ${sets.join(", ")} WHERE id = ?`, vals);
  res.json({ ok: true });
});

// ── Delete policy ──────────────────────────────────────────────────
router.delete("/:id", requireAdmin as any, (req: AuthRequest, res: Response) => {
  runSql("DELETE FROM policy WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
