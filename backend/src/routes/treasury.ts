import { Router, Response } from "express";
import { type AuthRequest, requireAuth, requireAdmin } from "../middleware/auth.js";
import { config } from "../config.js";
import { getTreasuryUsdcBalance, getTokenBalance } from "../services/chain.js";
import type { Address } from "viem";

const router = Router();

// ── GET /treasury/balances ─────────────────────────────────────────
router.get("/balances", requireAuth as any, async (_req: AuthRequest, res: Response) => {
  try {
    const usdcBalance = await getTreasuryUsdcBalance();
    const usycBalance = config.contracts.core
      ? await getTokenBalance(
          config.contracts.usyc as Address,
          config.contracts.core as Address
        )
      : 0n;

    // Return human-readable values (USDC = 6 decimals, USYC = 6 decimals)
    res.json({
      usdc: Number(usdcBalance) / 1e6,
      usyc: Number(usycBalance) / 1e6,
      raw: {
        usdc: usdcBalance.toString(),
        usyc: usycBalance.toString(),
      },
      chainBalances: [
        { chainId: 0, chainName: "Arc (Hub)", usdcBalance: Number(usdcBalance) / 1e6 },
      ],
    });
  } catch (err: any) {
    // If chain isn't reachable, return zeros with a warning
    res.json({
      usdc: 0,
      usyc: 0,
      raw: { usdc: "0", usyc: "0" },
      chainBalances: [],
      warning: err.message,
    });
  }
});

// ── POST /treasury/rebalance (manual) ──────────────────────────────
router.post("/rebalance", requireAdmin as any, async (req: AuthRequest, res: Response) => {
  const { direction, amount } = req.body; // direction: 'usdcToUsyc' | 'usycToUsdc'
  if (!direction || !amount) {
    return res.status(400).json({ error: "direction and amount required" });
  }
  // In production, this would call the Rebalance contract via walletClient.
  // For now, return a placeholder.
  res.json({
    ok: true,
    message: `Rebalance ${direction} for ${amount} queued. (Chain integration pending contract deploy)`,
  });
});

export default router;
