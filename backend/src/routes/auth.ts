import { Router, Request, Response } from "express";
import { handleNonce, handleVerify, handleLogout, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// GET /auth/nonce  → returns { id, nonce }
router.get("/nonce", handleNonce);

// POST /auth/verify  → { message, signature, nonceId } → { sessionId, wallet, role }
router.post("/verify", handleVerify);

// POST /auth/logout
router.post("/logout", handleLogout as any);

// GET /auth/me  → current session info
router.get("/me", (req: AuthRequest, res: Response) => {
  if (!req.wallet) {
    return res.json({ wallet: null, role: null });
  }
  res.json({ wallet: req.wallet, role: req.role });
});

export default router;
