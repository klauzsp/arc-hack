import { Router, Response } from "express";
import { v4 as uuid } from "uuid";
import { queryAll, queryOne, runSql } from "../db/connection.js";
import { type AuthRequest, requireAdmin, requireAuth } from "../middleware/auth.js";
import { computeEarnings } from "../services/earnings.js";
import {
  createPayRunOnChain,
  fundPayRunOnChain,
  executePayRunOnChain,
} from "../services/chain.js";
import type { Address } from "viem";

const router = Router();

// ── List pay runs ──────────────────────────────────────────────────
router.get("/", requireAuth as any, (_req: AuthRequest, res: Response) => {
  const rows = queryAll(
    `SELECT id, period_start as periodStart, period_end as periodEnd,
            status, total_amount as totalAmount, recipient_count as recipientCount,
            tx_hash as txHash, executed_at as executedAt
     FROM pay_run WHERE company_id = 'default' ORDER BY created_at DESC`
  );
  res.json(rows);
});

// ── Get pay run detail ─────────────────────────────────────────────
router.get("/:id", requireAuth as any, (req: AuthRequest, res: Response) => {
  const pr = queryOne(
    `SELECT id, period_start as periodStart, period_end as periodEnd,
            status, total_amount as totalAmount, recipient_count as recipientCount,
            tx_hash as txHash, executed_at as executedAt
     FROM pay_run WHERE id = ?`,
    [req.params.id]
  ) as any;
  if (!pr) return res.status(404).json({ error: "Not found" });

  const items = queryAll(
    `SELECT pri.id, pri.employee_id as recipientId, pri.amount, pri.chain_id as chainId,
            pri.status, pri.tx_hash as txHash, e.name as recipientName, e.wallet_address as walletAddress
     FROM pay_run_item pri
     JOIN employee e ON e.id = pri.employee_id
     WHERE pri.pay_run_id = ?`,
    [req.params.id]
  );

  res.json({ ...pr, items });
});

// ── Create pay run (draft) ─────────────────────────────────────────
router.post("/", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const { periodStart, periodEnd } = req.body;

  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: "periodStart and periodEnd required" });
  }

  const employees = queryAll("SELECT * FROM employee WHERE company_id = 'default'");

  const payRunId = uuid();
  let totalAmount = 0;
  const items: { employeeId: string; amount: number; chainId: number }[] = [];

  for (const emp of employees as any[]) {
    const earnings = computeEarnings(emp.id, periodStart, periodEnd);
    const amount = Math.max(0, earnings.availableToWithdraw);
    if (amount <= 0) continue;

    const CHAIN_MAP: Record<string, number> = {
      Arc: 0, Ethereum: 1, Base: 8453, Arbitrum: 42161,
    };
    const chainId = CHAIN_MAP[emp.chain_preference] ?? 0;

    items.push({ employeeId: emp.id, amount, chainId });
    totalAmount += amount;
  }

  runSql(
    `INSERT INTO pay_run (id, company_id, period_start, period_end, status, total_amount, recipient_count)
     VALUES (?, 'default', ?, ?, 'draft', ?, ?)`,
    [payRunId, periodStart, periodEnd, totalAmount, items.length]
  );

  for (const item of items) {
    runSql(
      `INSERT INTO pay_run_item (id, pay_run_id, employee_id, amount, chain_id, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [uuid(), payRunId, item.employeeId, item.amount, item.chainId]
    );
  }

  res.status(201).json({ id: payRunId, totalAmount, recipientCount: items.length });
});

// ── Approve pay run ────────────────────────────────────────────────
router.post("/:id/approve", requireAdmin as any, (req: AuthRequest, res: Response) => {
  const pr = queryOne("SELECT * FROM pay_run WHERE id = ?", [req.params.id]) as any;
  if (!pr) return res.status(404).json({ error: "Not found" });
  if (pr.status !== "draft") return res.status(400).json({ error: "Only draft pay runs can be approved" });

  runSql("UPDATE pay_run SET status = 'approved' WHERE id = ?", [req.params.id]);
  res.json({ ok: true, status: "approved" });
});

// ── Execute pay run ────────────────────────────────────────────────
router.post("/:id/execute", requireAdmin as any, async (req: AuthRequest, res: Response) => {
  const pr = queryOne("SELECT * FROM pay_run WHERE id = ?", [req.params.id]) as any;
  if (!pr) return res.status(404).json({ error: "Not found" });
  if (pr.status !== "approved") {
    return res.status(400).json({ error: "Only approved pay runs can be executed" });
  }

  const items = queryAll("SELECT * FROM pay_run_item WHERE pay_run_id = ?", [req.params.id]) as any[];

  try {
    const recipients = items.map((i: any) => {
      const emp = queryOne("SELECT wallet_address FROM employee WHERE id = ?", [i.employee_id]) as any;
      return emp.wallet_address as Address;
    });
    const amounts = items.map((i: any) => BigInt(Math.round(i.amount * 1e6)));
    const chainIds = items.map((i: any) => BigInt(i.chain_id || 0));
    const totalBigInt = amounts.reduce((a, b) => a + b, 0n);
    const periodEndTs = Math.floor(new Date(pr.period_end).getTime() / 1000);

    const createTxHash = await createPayRunOnChain(req.params.id, periodEndTs, recipients, amounts, chainIds);
    const fundTxHash = await fundPayRunOnChain(req.params.id, totalBigInt);
    const execTxHash = await executePayRunOnChain(req.params.id);

    const now = new Date().toISOString();
    runSql("UPDATE pay_run SET status = 'executed', tx_hash = ?, executed_at = ? WHERE id = ?",
      [execTxHash, now, req.params.id]);
    runSql("UPDATE pay_run_item SET status = 'executed', tx_hash = ? WHERE pay_run_id = ?",
      [execTxHash, req.params.id]);

    res.json({ ok: true, status: "executed", txHash: execTxHash });
  } catch (err: any) {
    runSql("UPDATE pay_run SET status = 'failed' WHERE id = ?", [req.params.id]);
    res.status(500).json({ error: err.message, status: "failed" });
  }
});

export default router;
