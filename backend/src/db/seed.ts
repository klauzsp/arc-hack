/**
 * Seed the database with demo data matching the frontend's mock files.
 * Run: npx tsx src/db/seed.ts
 */
import { initDb, runSql, saveDb } from "./connection.js";
import { migrate } from "./migrate.js";

async function seed() {
  await migrate();

  // ── Employees / Recipients ───────────────────────────────────────
  const employees = [
    ["r-1", "0x742d35Cc6634C0532925a3b844Bc9e7595f3a1f", "Alice Chen", "yearly", 95000, "Arc", "s-1", "schedule_based", "employee"],
    ["r-2", "0x8b2ef3a24c6e8Bb1a5290AeD04269d9c4d", "Bob Smith", "hourly", 45, "Base", null, "check_in_out", "employee"],
    ["r-3", "0x1f3a7DcBe9F2a41c5948e7a3b8C02e7e2b", "Carol Davis", "daily", 320, "Arc", "s-1", "schedule_based", "employee"],
    ["r-4", "0x4e8c2Bf0a93D71c84aFe3b2109d5c8f1e2", "David Park", "yearly", 78000, "Arbitrum", "s-1", "schedule_based", "employee"],
    ["r-5", "0xa7f3E9c1b24D068e5A3f1c28B94d7e0a5b", "Emma Wilson", "hourly", 55, "Arc", null, "check_in_out", "employee"],
    ["r-6", "0x3b9cA1d7E823f0a64B2e8D1c5F07a3e9d4", "Frank Lopez", "yearly", 112000, "Arc", "s-1", "schedule_based", "employee"],
    ["admin-1", "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0", "CEO (Admin)", "yearly", 0, "Arc", "s-1", "schedule_based", "admin"],
  ];

  for (const e of employees) {
    runSql(
      `INSERT OR REPLACE INTO employee (id, company_id, wallet_address, name, pay_type, rate,
         chain_preference, schedule_id, time_tracking_mode, role)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?)`,
      e as any[]
    );
  }

  // ── Holidays ─────────────────────────────────────────────────────
  const holidays = [
    ["hol-1", "2025-01-01", "New Year's Day"],
    ["hol-2", "2025-01-20", "MLK Day"],
    ["hol-3", "2025-02-17", "Presidents' Day"],
    ["hol-4", "2025-05-26", "Memorial Day"],
    ["hol-5", "2025-07-04", "Independence Day"],
    ["hol-6", "2025-09-01", "Labor Day"],
    ["hol-7", "2025-11-27", "Thanksgiving"],
    ["hol-8", "2025-12-25", "Christmas"],
  ];

  for (const h of holidays) {
    runSql("INSERT OR REPLACE INTO holiday (id, company_id, date, name) VALUES (?, 'default', ?, ?)", h as any[]);
  }

  // ── Time entries for Bob Smith ───────────────────────────────────
  const timeEntries = [
    ["t-1", "r-2", "2025-02-24", "08:30", "12:15"],
    ["t-2", "r-2", "2025-02-24", "13:00", "17:30"],
    ["t-3", "r-2", "2025-02-25", "08:45", "12:00"],
    ["t-4", "r-2", "2025-02-25", "13:00", "17:15"],
    ["t-5", "r-2", "2025-02-26", "09:00", "12:30"],
    ["t-6", "r-2", "2025-02-26", "13:15", "17:45"],
    ["t-7", "r-2", "2025-02-27", "08:30", "12:00"],
    ["t-8", "r-2", "2025-02-27", "13:00", "17:00"],
  ];

  for (const t of timeEntries) {
    runSql(
      "INSERT OR REPLACE INTO time_entry (id, employee_id, date, clock_in, clock_out) VALUES (?, ?, ?, ?, ?)",
      t as any[]
    );
  }

  // ── Sample pay runs ──────────────────────────────────────────────
  const payRuns = [
    ["pr-1", "2025-01-01", "2025-01-15", "executed", 134250, 14, "0x7a3fe12d", "2025-01-16T09:30:00Z"],
    ["pr-2", "2025-01-16", "2025-01-31", "executed", 128900, 13, "0x9bc48f2e", "2025-02-01T10:15:00Z"],
    ["pr-3", "2025-02-01", "2025-02-15", "executed", 125000, 12, "0xabc13d4e", "2025-02-16T10:00:00Z"],
    ["pr-4", "2025-02-16", "2025-02-28", "approved", 118500, 11, null, null],
    ["pr-5", "2025-03-01", "2025-03-15", "draft", 121000, 12, null, null],
  ];

  for (const pr of payRuns) {
    runSql(
      `INSERT OR REPLACE INTO pay_run (id, company_id, period_start, period_end, status, total_amount, recipient_count, tx_hash, executed_at)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)`,
      pr as any[]
    );
  }

  // ── Policies ─────────────────────────────────────────────────────
  const policies = [
    ["pol-1", "Bi-weekly payroll", "scheduled", JSON.stringify({ cron: "0 9 1,16 * *", autoExecute: false })],
    ["pol-2", "Auto USDC→USYC when idle", "threshold", JSON.stringify({ threshold: 50000, direction: "usdcToUsyc" })],
  ];

  for (const p of policies) {
    runSql(
      "INSERT OR REPLACE INTO policy (id, company_id, name, type, config, enabled) VALUES (?, 'default', ?, ?, ?, 1)",
      p as any[]
    );
  }

  saveDb();
  console.log("🌱 Seed data inserted successfully");
}

seed().catch(console.error);
