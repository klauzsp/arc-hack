/**
 * Run this script to create / migrate the database tables.
 *   npx tsx src/db/migrate.ts
 */
import { initDb, saveDb } from "./connection.js";

export async function migrate() {
  const db = await initDb();

  db.run(`
    -- Company
    CREATE TABLE IF NOT EXISTS company (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      time_tracking_mode TEXT NOT NULL DEFAULT 'schedule_based',
      pay_frequency      TEXT NOT NULL DEFAULT 'biweekly'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule (
      id            TEXT PRIMARY KEY,
      company_id    TEXT NOT NULL REFERENCES company(id),
      working_days  TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      hours_per_day REAL NOT NULL DEFAULT 8,
      timezone      TEXT NOT NULL DEFAULT 'America/New_York'
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS employee (
      id                  TEXT PRIMARY KEY,
      company_id          TEXT NOT NULL REFERENCES company(id),
      wallet_address      TEXT NOT NULL,
      name                TEXT NOT NULL,
      pay_type            TEXT NOT NULL DEFAULT 'yearly',
      rate                REAL NOT NULL DEFAULT 0,
      chain_preference    TEXT DEFAULT 'Arc',
      schedule_id         TEXT REFERENCES schedule(id),
      time_tracking_mode  TEXT NOT NULL DEFAULT 'schedule_based',
      role                TEXT NOT NULL DEFAULT 'employee',
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS holiday (
      id          TEXT PRIMARY KEY,
      company_id  TEXT NOT NULL REFERENCES company(id),
      date        TEXT NOT NULL,
      name        TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS time_entry (
      id            TEXT PRIMARY KEY,
      employee_id   TEXT NOT NULL REFERENCES employee(id),
      date          TEXT NOT NULL,
      clock_in      TEXT NOT NULL,
      clock_out     TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pay_run (
      id              TEXT PRIMARY KEY,
      company_id      TEXT NOT NULL REFERENCES company(id),
      period_start    TEXT NOT NULL,
      period_end      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft',
      total_amount    REAL NOT NULL DEFAULT 0,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      tx_hash         TEXT,
      executed_at     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pay_run_item (
      id            TEXT PRIMARY KEY,
      pay_run_id    TEXT NOT NULL REFERENCES pay_run(id),
      employee_id   TEXT NOT NULL REFERENCES employee(id),
      amount        REAL NOT NULL,
      chain_id      INTEGER DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      tx_hash       TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS policy (
      id          TEXT PRIMARY KEY,
      company_id  TEXT NOT NULL REFERENCES company(id),
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'scheduled',
      config      TEXT NOT NULL DEFAULT '{}',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed defaults
  db.run(`INSERT OR IGNORE INTO company (id, name, time_tracking_mode, pay_frequency)
    VALUES ('default', 'Acme Corp', 'schedule_based', 'biweekly')`);

  db.run(`INSERT OR IGNORE INTO schedule (id, company_id, working_days, hours_per_day, timezone)
    VALUES ('s-1', 'default', '[1,2,3,4,5]', 8, 'America/New_York')`);

  saveDb();
  console.log("✅ Database migrated successfully");
}

// Allow running directly
migrate().catch(console.error);
