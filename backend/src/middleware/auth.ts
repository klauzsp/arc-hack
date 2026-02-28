/**
 * Lightweight SIWE-style auth middleware.
 *
 * For the hackathon, we support two modes:
 * 1. Full SIWE flow (POST /auth/nonce → sign → POST /auth/verify)
 * 2. Shortcut: pass `x-wallet-address` header for dev/testing
 *
 * Once verified, req.wallet and req.role are populated.
 */
import { Request, Response, NextFunction } from "express";
import { SiweMessage, generateNonce } from "siwe";
import { queryOne } from "../db/connection.js";

// In-memory nonce store (swap for Redis in production)
const nonces = new Map<string, { nonce: string; expiresAt: number }>();
// In-memory sessions (cookie-less for simplicity)
const sessions = new Map<string, { wallet: string; role: string }>();

export interface AuthRequest extends Request {
  wallet?: string;
  role?: "admin" | "employee" | null;
  sessionId?: string;
}

// ── Nonce ───────────────────────────────────────────────────────────

export function handleNonce(_req: Request, res: Response) {
  const nonce = generateNonce();
  const id = Math.random().toString(36).slice(2);
  nonces.set(id, { nonce, expiresAt: Date.now() + 5 * 60_000 });
  res.json({ id, nonce });
}

// ── Verify ──────────────────────────────────────────────────────────

export async function handleVerify(req: Request, res: Response) {
  try {
    const { message, signature, nonceId } = req.body;
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Check nonce
    const stored = nonces.get(nonceId);
    if (!stored || stored.nonce !== siweMessage.nonce || stored.expiresAt < Date.now()) {
      return res.status(401).json({ error: "Invalid or expired nonce" });
    }
    nonces.delete(nonceId);

    const wallet = siweMessage.address.toLowerCase();
    const role = resolveRole(wallet);

    const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.set(sessionId, { wallet, role });

    res.json({ sessionId, wallet, role });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

// ── Middleware ───────────────────────────────────────────────────────

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  // 1. Check session header
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId)!;
    req.wallet = s.wallet;
    req.role = s.role as "admin" | "employee";
    req.sessionId = sessionId;
    return next();
  }

  // 2. Dev shortcut: x-wallet-address header
  const devWallet = req.headers["x-wallet-address"] as string | undefined;
  if (devWallet) {
    req.wallet = devWallet.toLowerCase();
    req.role = resolveRole(req.wallet);
    return next();
  }

  // 3. No auth → still allow (role = null). Routes can check as needed.
  req.wallet = undefined;
  req.role = null;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.wallet) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// ── Helpers ─────────────────────────────────────────────────────────

function resolveRole(wallet: string): "admin" | "employee" {
  try {
    const row = queryOne<{ role: string }>(
      "SELECT role FROM employee WHERE LOWER(wallet_address) = ?",
      [wallet]
    );
    return (row?.role as "admin" | "employee") || "employee";
  } catch {
    return "employee";
  }
}

export function handleLogout(req: AuthRequest, res: Response) {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) sessions.delete(sessionId);
  res.json({ ok: true });
}
