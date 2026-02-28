import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import recipientRoutes from "./routes/recipients.js";
import timeRoutes from "./routes/time.js";
import earningsRoutes from "./routes/earnings.js";
import payRunRoutes from "./routes/payRuns.js";
import treasuryRoutes from "./routes/treasury.js";
import policyRoutes from "./routes/policies.js";
import dashboardRoutes from "./routes/dashboard.js";
import { startRebalanceJob } from "./jobs/rebalance.js";
import { migrate } from "./db/migrate.js";

// Ensure data dir exists
const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname2, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function main() {
  // Run migrations (also initializes the DB)
  await migrate();

  const app = express();

  // ── Middleware ────────────────────────────────────────────────────
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(authMiddleware as any);

  // ── Routes ───────────────────────────────────────────────────────
  app.use("/auth", authRoutes);
  app.use("/recipients", recipientRoutes);
  app.use("/time", timeRoutes);
  app.use("/earnings", earningsRoutes);
  app.use("/pay-runs", payRunRoutes);
  app.use("/treasury", treasuryRoutes);
  app.use("/policies", policyRoutes);
  app.use("/dashboard", dashboardRoutes);

  // Health check
  app.get("/health", (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

  // ── Start ────────────────────────────────────────────────────────
  app.listen(config.port, () => {
    console.log(`🚀 Backend running on http://localhost:${config.port}`);
    console.log(`   Routes: /auth, /recipients, /time, /earnings, /pay-runs, /treasury, /policies, /dashboard`);
  });

  // ── Jobs ─────────────────────────────────────────────────────────
  startRebalanceJob();
}

main().catch(console.error);
