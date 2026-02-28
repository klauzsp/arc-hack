import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeLegacyDestination } from "./lib/cctp";
import { createSeedPayload } from "./domain/seeds";
import type {
  AuthChallengeRecord,
  CompanyRecord,
  EmployeeRecord,
  EmployeeInviteCodeRecord,
  HolidayRecord,
  PayRunItemRecord,
  PayRunRecord,
  PolicyRecord,
  ScheduleRecord,
  SessionRecord,
  TimeOffRequestRecord,
  TimeEntryRecord,
  TreasuryBalanceRecord,
  WithdrawalRecord,
} from "./domain/types";

function toNumber(value: unknown) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function toBoolean(value: unknown) {
  return toNumber(value) !== 0;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapCompany(row: Record<string, unknown>): CompanyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    payFrequency: "semimonthly",
    defaultTimeTrackingMode: row.default_time_tracking_mode as CompanyRecord["defaultTimeTrackingMode"],
    treasuryUsycCents: toNumber(row.treasury_usyc_cents),
    autoRebalanceEnabled: toBoolean(row.auto_rebalance_enabled),
    autoRedeemEnabled: toBoolean(row.auto_redeem_enabled),
    rebalanceThresholdCents: toNumber(row.rebalance_threshold_cents),
    payoutNoticeHours: toNumber(row.payout_notice_hours),
    maxTimeOffDaysPerYear: toNumber(row.max_time_off_days_per_year),
  };
}

function mapTreasuryBalance(row: Record<string, unknown>): TreasuryBalanceRecord {
  return {
    companyId: String(row.company_id),
    chainId: toNumber(row.chain_id),
    chainName: String(row.chain_name),
    usdcCents: toNumber(row.usdc_cents),
    isHub: toBoolean(row.is_hub),
  };
}

function mapSchedule(row: Record<string, unknown>): ScheduleRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    timezone: String(row.timezone),
    startTime: String(row.start_time),
    hoursPerDay: toNumber(row.hours_per_day),
    workingDays: parseJson<number[]>(row.working_days_json, []),
  };
}

function mapEmployee(row: Record<string, unknown>): EmployeeRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    walletAddress: String(row.wallet_address),
    name: String(row.name),
    role: "employee",
    payType: row.pay_type as EmployeeRecord["payType"],
    rateCents: toNumber(row.rate_cents),
    chainPreference: row.chain_preference == null ? null : String(row.chain_preference),
    destinationChainId:
      row.destination_chain_id == null ? null : normalizeLegacyDestination(toNumber(row.destination_chain_id)),
    destinationWalletAddress:
      row.destination_wallet_address == null ? null : String(row.destination_wallet_address),
    scheduleId: row.schedule_id == null ? null : String(row.schedule_id),
    timeTrackingMode: row.time_tracking_mode as EmployeeRecord["timeTrackingMode"],
    employmentStartDate:
      row.employment_start_date == null ? null : String(row.employment_start_date),
    onboardingStatus: (row.onboarding_status as EmployeeRecord["onboardingStatus"]) ?? "claimed",
    onboardingMethod: (row.onboarding_method as EmployeeRecord["onboardingMethod"]) ?? "existing_wallet",
    claimedAt: row.claimed_at == null ? null : String(row.claimed_at),
    circleUserId: row.circle_user_id == null ? null : String(row.circle_user_id),
    circleWalletId: row.circle_wallet_id == null ? null : String(row.circle_wallet_id),
    active: toBoolean(row.active),
  };
}

function mapHoliday(row: Record<string, unknown>): HolidayRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    date: String(row.date),
    name: String(row.name),
  };
}

function mapTimeEntry(row: Record<string, unknown>): TimeEntryRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    date: String(row.date),
    clockIn: String(row.clock_in),
    clockOut: row.clock_out == null ? null : String(row.clock_out),
    createdAt: String(row.created_at),
  };
}

function mapPayRun(row: Record<string, unknown>): PayRunRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    onChainId: row.on_chain_id == null ? null : String(row.on_chain_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status: row.status as PayRunRecord["status"],
    totalAmountCents: toNumber(row.total_amount_cents),
    executedAt: row.executed_at == null ? null : String(row.executed_at),
    txHash: row.tx_hash == null ? null : String(row.tx_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPayRunItem(row: Record<string, unknown>): PayRunItemRecord {
  return {
    id: String(row.id),
    payRunId: String(row.pay_run_id),
    employeeId: String(row.employee_id),
    recipientWalletAddress: String(row.recipient_wallet_address),
    destinationChainId: normalizeLegacyDestination(toNumber(row.destination_chain_id)) ?? 0,
    amountCents: toNumber(row.amount_cents),
    maxFeeBaseUnits: toNumber(row.max_fee_base_units),
    minFinalityThreshold: toNumber(row.min_finality_threshold),
    useForwarder: toBoolean(row.use_forwarder),
    bridgeNonce: row.bridge_nonce == null ? null : String(row.bridge_nonce),
    status: String(row.status),
    txHash: row.tx_hash == null ? null : String(row.tx_hash),
  };
}

function mapPolicy(row: Record<string, unknown>): PolicyRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    type: row.type as PolicyRecord["type"],
    status: row.status as PolicyRecord["status"],
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    lastRunAt: row.last_run_at == null ? null : String(row.last_run_at),
  };
}

function mapChallenge(row: Record<string, unknown>): AuthChallengeRecord {
  return {
    address: String(row.address),
    nonce: String(row.nonce),
    message: String(row.message),
    expiresAt: String(row.expires_at),
  };
}

function mapEmployeeInviteCode(row: Record<string, unknown>): EmployeeInviteCodeRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    codeHash: String(row.code_hash),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    usedAt: row.used_at == null ? null : String(row.used_at),
  };
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    token: String(row.token),
    address: String(row.address),
    role: row.role as SessionRecord["role"],
    employeeId: row.employee_id == null ? null : String(row.employee_id),
    expiresAt: String(row.expires_at),
  };
}

function mapWithdrawal(row: Record<string, unknown>): WithdrawalRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    walletAddress: String(row.wallet_address),
    amountCents: toNumber(row.amount_cents),
    txHash: row.tx_hash == null ? null : String(row.tx_hash),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    createdAt: String(row.created_at),
    status: row.status as WithdrawalRecord["status"],
  };
}

function mapTimeOffRequest(row: Record<string, unknown>): TimeOffRequestRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    date: String(row.date),
    note: row.note == null ? null : String(row.note),
    status: row.status as TimeOffRequestRecord["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
  };
}

export class PayrollRepository {
  private readonly db: DatabaseSync;
  private readonly demoPayRunIds = ["pr-1", "pr-2", "pr-3", "pr-4", "pr-5"] as const;

  constructor(private readonly dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.createSchema();
  }

  close() {
    this.db.close();
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pay_frequency TEXT NOT NULL,
        default_time_tracking_mode TEXT NOT NULL,
        treasury_usyc_cents INTEGER NOT NULL,
        auto_rebalance_enabled INTEGER NOT NULL,
        auto_redeem_enabled INTEGER NOT NULL,
        rebalance_threshold_cents INTEGER NOT NULL,
        payout_notice_hours INTEGER NOT NULL,
        max_time_off_days_per_year INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS treasury_balances (
        company_id TEXT NOT NULL,
        chain_id INTEGER PRIMARY KEY,
        chain_name TEXT NOT NULL,
        usdc_cents INTEGER NOT NULL,
        is_hub INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        start_time TEXT NOT NULL,
        hours_per_day REAL NOT NULL,
        working_days_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pay_type TEXT NOT NULL,
        rate_cents INTEGER NOT NULL,
        chain_preference TEXT,
        destination_chain_id INTEGER,
        destination_wallet_address TEXT,
        schedule_id TEXT,
        time_tracking_mode TEXT NOT NULL,
        employment_start_date TEXT,
        onboarding_status TEXT NOT NULL DEFAULT 'claimed',
        onboarding_method TEXT,
        claimed_at TEXT,
        circle_user_id TEXT,
        circle_wallet_id TEXT,
        active INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS holidays (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        date TEXT NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        clock_in TEXT NOT NULL,
        clock_out TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pay_runs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        on_chain_id TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        status TEXT NOT NULL,
        total_amount_cents INTEGER NOT NULL,
        executed_at TEXT,
        tx_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pay_run_items (
        id TEXT PRIMARY KEY,
        pay_run_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        recipient_wallet_address TEXT NOT NULL,
        destination_chain_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        max_fee_base_units INTEGER NOT NULL DEFAULT 0,
        min_finality_threshold INTEGER NOT NULL DEFAULT 2000,
        use_forwarder INTEGER NOT NULL DEFAULT 0,
        bridge_nonce TEXT,
        status TEXT NOT NULL,
        tx_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        last_run_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_challenges (
        address TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        message TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        role TEXT NOT NULL,
        employee_id TEXT,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        tx_hash TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_off_requests (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        reviewed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS employee_invite_codes (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
      CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, date);
      CREATE INDEX IF NOT EXISTS idx_pay_runs_period_start ON pay_runs(period_start DESC);
      CREATE INDEX IF NOT EXISTS idx_pay_run_items_pay_run_id ON pay_run_items(pay_run_id);
      CREATE INDEX IF NOT EXISTS idx_policies_type_status ON policies(type, status);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges(expires_at);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_employee_period ON withdrawals(employee_id, period_start, period_end);
      CREATE INDEX IF NOT EXISTS idx_time_off_requests_employee_date ON time_off_requests(employee_id, date);
      CREATE INDEX IF NOT EXISTS idx_time_off_requests_status_date ON time_off_requests(status, date);
      CREATE INDEX IF NOT EXISTS idx_employee_invite_codes_employee_id ON employee_invite_codes(employee_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_employee_invite_codes_expires_at ON employee_invite_codes(expires_at);
    `);

    this.ensureColumn("employees", "employment_start_date", "TEXT");
    this.ensureColumn("companies", "max_time_off_days_per_year", "INTEGER NOT NULL DEFAULT 20");
    this.ensureColumn("schedules", "start_time", "TEXT NOT NULL DEFAULT '09:00'");
    this.ensureColumn("employees", "onboarding_status", "TEXT NOT NULL DEFAULT 'claimed'");
    this.ensureColumn("employees", "onboarding_method", "TEXT");
    this.ensureColumn("employees", "claimed_at", "TEXT");
    this.ensureColumn("employees", "circle_user_id", "TEXT");
    this.ensureColumn("employees", "circle_wallet_id", "TEXT");
    this.ensureColumn("pay_run_items", "max_fee_base_units", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("pay_run_items", "min_finality_threshold", "INTEGER NOT NULL DEFAULT 2000");
    this.ensureColumn("pay_run_items", "use_forwarder", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("pay_run_items", "bridge_nonce", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
    if (columns.some((entry) => String(entry.name) === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private removeDemoPayRuns() {
    const placeholders = this.demoPayRunIds.map(() => "?").join(", ");
    this.transaction(() => {
      this.db.prepare(`DELETE FROM pay_run_items WHERE pay_run_id IN (${placeholders})`).run(...this.demoPayRunIds);
      this.db.prepare(`DELETE FROM pay_runs WHERE id IN (${placeholders})`).run(...this.demoPayRunIds);
    });
  }

  private normalizeLegacyDestinationIds() {
    const normalize = this.db.prepare(
      "UPDATE employees SET destination_chain_id = ? WHERE destination_chain_id = ?",
    );
    const normalizeItems = this.db.prepare(
      "UPDATE pay_run_items SET destination_chain_id = ? WHERE destination_chain_id = ?",
    );

    const rows = this.db.prepare("SELECT DISTINCT destination_chain_id FROM employees WHERE destination_chain_id IS NOT NULL").all() as Array<Record<string, unknown>>;
    const itemRows = this.db.prepare("SELECT DISTINCT destination_chain_id FROM pay_run_items").all() as Array<Record<string, unknown>>;
    for (const row of [...rows, ...itemRows]) {
      const current = toNumber(row.destination_chain_id);
      const normalized = normalizeLegacyDestination(current);
      if (normalized == null || normalized === current) continue;
      normalize.run(normalized, current);
      normalizeItems.run(normalized, current);
    }
  }

  private backfillOnboardingDefaults() {
    this.db.prepare(
      "UPDATE employees SET onboarding_status = 'claimed' WHERE onboarding_status IS NULL OR onboarding_status = ''",
    ).run();
    this.db.prepare(
      `UPDATE employees
       SET onboarding_method = 'existing_wallet'
       WHERE onboarding_method IS NULL
         AND (wallet_address LIKE '0x%' OR destination_wallet_address LIKE '0x%')`,
    ).run();
  }

  initialize(seedInput: { companyId: string; companyName: string; today: string; arcChainId: number }) {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM companies").get() as Record<string, unknown>;
    if (toNumber(row.count) > 0) {
      this.removeDemoPayRuns();
      this.normalizeLegacyDestinationIds();
      this.backfillOnboardingDefaults();
      return;
    }

    const payload = createSeedPayload(seedInput);

    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO companies (
            id, name, pay_frequency, default_time_tracking_mode, treasury_usyc_cents,
            auto_rebalance_enabled, auto_redeem_enabled, rebalance_threshold_cents, payout_notice_hours,
            max_time_off_days_per_year
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          payload.company.id,
          payload.company.name,
          payload.company.payFrequency,
          payload.company.defaultTimeTrackingMode,
          payload.company.treasuryUsycCents,
          Number(payload.company.autoRebalanceEnabled),
          Number(payload.company.autoRedeemEnabled),
          payload.company.rebalanceThresholdCents,
          payload.company.payoutNoticeHours,
          payload.company.maxTimeOffDaysPerYear,
        );

      const insertTreasury = this.db.prepare(
        "INSERT INTO treasury_balances (company_id, chain_id, chain_name, usdc_cents, is_hub) VALUES (?, ?, ?, ?, ?)",
      );
      for (const balance of payload.treasuryBalances) {
        insertTreasury.run(
          balance.companyId,
          balance.chainId,
          balance.chainName,
          balance.usdcCents,
          Number(balance.isHub),
        );
      }

      const insertSchedule = this.db.prepare(
        "INSERT INTO schedules (id, company_id, name, timezone, start_time, hours_per_day, working_days_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const schedule of payload.schedules) {
        insertSchedule.run(
          schedule.id,
          schedule.companyId,
          schedule.name,
          schedule.timezone,
          schedule.startTime,
          schedule.hoursPerDay,
          JSON.stringify(schedule.workingDays),
        );
      }

      const insertEmployee = this.db.prepare(
        `INSERT INTO employees (
          id, company_id, wallet_address, name, role, pay_type, rate_cents, chain_preference,
          destination_chain_id, destination_wallet_address, schedule_id, time_tracking_mode, employment_start_date,
          onboarding_status, onboarding_method, claimed_at, circle_user_id, circle_wallet_id, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const employee of payload.employees) {
        insertEmployee.run(
          employee.id,
          employee.companyId,
          employee.walletAddress,
          employee.name,
          employee.role,
          employee.payType,
          employee.rateCents,
          employee.chainPreference,
          employee.destinationChainId,
          employee.destinationWalletAddress,
          employee.scheduleId,
          employee.timeTrackingMode,
          employee.employmentStartDate,
          employee.onboardingStatus,
          employee.onboardingMethod,
          employee.claimedAt,
          employee.circleUserId,
          employee.circleWalletId,
          Number(employee.active),
        );
      }

      const insertHoliday = this.db.prepare(
        "INSERT INTO holidays (id, company_id, date, name) VALUES (?, ?, ?, ?)",
      );
      for (const holiday of payload.holidays) {
        insertHoliday.run(holiday.id, holiday.companyId, holiday.date, holiday.name);
      }

      const insertTimeEntry = this.db.prepare(
        "INSERT INTO time_entries (id, employee_id, date, clock_in, clock_out, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const entry of payload.timeEntries) {
        insertTimeEntry.run(
          entry.id,
          entry.employeeId,
          entry.date,
          entry.clockIn,
          entry.clockOut,
          entry.createdAt,
        );
      }

      const insertPayRun = this.db.prepare(
        `INSERT INTO pay_runs (
          id, company_id, on_chain_id, period_start, period_end, status, total_amount_cents,
          executed_at, tx_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const payRun of payload.payRuns) {
        insertPayRun.run(
          payRun.id,
          payRun.companyId,
          payRun.onChainId,
          payRun.periodStart,
          payRun.periodEnd,
          payRun.status,
          payRun.totalAmountCents,
          payRun.executedAt,
          payRun.txHash,
          payRun.createdAt,
          payRun.updatedAt,
        );
      }

      const insertPayRunItem = this.db.prepare(
        `INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents,
          max_fee_base_units, min_finality_threshold, use_forwarder, bridge_nonce, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of payload.payRunItems) {
        insertPayRunItem.run(
          item.id,
          item.payRunId,
          item.employeeId,
          item.recipientWalletAddress,
          item.destinationChainId,
          item.amountCents,
          item.maxFeeBaseUnits,
          item.minFinalityThreshold,
          Number(item.useForwarder),
          item.bridgeNonce,
          item.status,
          item.txHash,
        );
      }

      const insertPolicy = this.db.prepare(
        "INSERT INTO policies (id, company_id, name, type, status, config_json, last_run_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const policy of payload.policies) {
        insertPolicy.run(
          policy.id,
          policy.companyId,
          policy.name,
          policy.type,
          policy.status,
          JSON.stringify(policy.config),
          policy.lastRunAt,
        );
      }

      const insertWithdrawal = this.db.prepare(
        `INSERT INTO withdrawals (
          id, employee_id, wallet_address, amount_cents, tx_hash, period_start, period_end, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const withdrawal of payload.withdrawals ?? []) {
        insertWithdrawal.run(
          withdrawal.id,
          withdrawal.employeeId,
          withdrawal.walletAddress,
          withdrawal.amountCents,
          withdrawal.txHash,
          withdrawal.periodStart,
          withdrawal.periodEnd,
          withdrawal.createdAt,
          withdrawal.status,
        );
      }

      const insertTimeOffRequest = this.db.prepare(
        `INSERT INTO time_off_requests (
          id, company_id, employee_id, date, note, status, created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const request of payload.timeOffRequests ?? []) {
        insertTimeOffRequest.run(
          request.id,
          request.companyId,
          request.employeeId,
          request.date,
          request.note,
          request.status,
          request.createdAt,
          request.updatedAt,
          request.reviewedAt,
        );
      }
    });

    this.removeDemoPayRuns();
    this.normalizeLegacyDestinationIds();
    this.backfillOnboardingDefaults();
  }

  getCompany() {
    const row = this.db.prepare("SELECT * FROM companies LIMIT 1").get() as Record<string, unknown> | undefined;
    return row ? mapCompany(row) : null;
  }

  updateCompany(company: CompanyRecord) {
    this.db
      .prepare(
        `UPDATE companies
         SET name = ?, pay_frequency = ?, default_time_tracking_mode = ?, treasury_usyc_cents = ?,
             auto_rebalance_enabled = ?, auto_redeem_enabled = ?, rebalance_threshold_cents = ?, payout_notice_hours = ?,
             max_time_off_days_per_year = ?
         WHERE id = ?`,
      )
      .run(
        company.name,
        company.payFrequency,
        company.defaultTimeTrackingMode,
        company.treasuryUsycCents,
        Number(company.autoRebalanceEnabled),
        Number(company.autoRedeemEnabled),
        company.rebalanceThresholdCents,
        company.payoutNoticeHours,
        company.maxTimeOffDaysPerYear,
        company.id,
      );
  }

  listTreasuryBalances() {
    return (
      this.db
        .prepare("SELECT * FROM treasury_balances ORDER BY is_hub DESC, chain_name ASC")
        .all() as Record<string, unknown>[]
    ).map(mapTreasuryBalance);
  }

  getTreasuryBalance(chainId: number) {
    const row = this.db
      .prepare("SELECT * FROM treasury_balances WHERE chain_id = ?")
      .get(chainId) as Record<string, unknown> | undefined;
    return row ? mapTreasuryBalance(row) : null;
  }

  updateTreasuryBalance(chainId: number, usdcCents: number) {
    this.db.prepare("UPDATE treasury_balances SET usdc_cents = ? WHERE chain_id = ?").run(usdcCents, chainId);
  }

  listSchedules() {
    return (this.db.prepare("SELECT * FROM schedules ORDER BY name ASC").all() as Record<string, unknown>[]).map(
      mapSchedule,
    );
  }

  getSchedule(id: string) {
    const row = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapSchedule(row) : null;
  }

  createSchedule(schedule: ScheduleRecord) {
    this.db
      .prepare(
        "INSERT INTO schedules (id, company_id, name, timezone, start_time, hours_per_day, working_days_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        schedule.id,
        schedule.companyId,
        schedule.name,
        schedule.timezone,
        schedule.startTime,
        schedule.hoursPerDay,
        JSON.stringify(schedule.workingDays),
      );
    return schedule;
  }

  updateSchedule(id: string, patch: Partial<ScheduleRecord>) {
    const current = this.getSchedule(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this.db
      .prepare(
        "UPDATE schedules SET company_id = ?, name = ?, timezone = ?, start_time = ?, hours_per_day = ?, working_days_json = ? WHERE id = ?",
      )
      .run(
        next.companyId,
        next.name,
        next.timezone,
        next.startTime,
        next.hoursPerDay,
        JSON.stringify(next.workingDays),
        id,
      );
    return next;
  }

  listEmployees(includeInactive = false) {
    const sql = includeInactive
      ? "SELECT * FROM employees ORDER BY name ASC"
      : "SELECT * FROM employees WHERE active = 1 ORDER BY name ASC";
    return (this.db.prepare(sql).all() as Record<string, unknown>[]).map(mapEmployee);
  }

  getEmployee(id: string) {
    const row = this.db.prepare("SELECT * FROM employees WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapEmployee(row) : null;
  }

  getEmployeeByWallet(walletAddress: string) {
    return this.getEmployeeByWalletInternal(walletAddress, false);
  }

  private getEmployeeByWalletInternal(walletAddress: string, includeInactive: boolean) {
    const row = this.db
      .prepare(
        includeInactive
          ? "SELECT * FROM employees WHERE wallet_address = ?"
          : "SELECT * FROM employees WHERE wallet_address = ? AND active = 1",
      )
      .get(walletAddress.toLowerCase()) as Record<string, unknown> | undefined;
    return row ? mapEmployee(row) : null;
  }

  getEmployeeByWalletIncludingInactive(walletAddress: string) {
    return this.getEmployeeByWalletInternal(walletAddress, true);
  }

  createEmployee(employee: EmployeeRecord) {
    this.db
      .prepare(
        `INSERT INTO employees (
          id, company_id, wallet_address, name, role, pay_type, rate_cents, chain_preference,
          destination_chain_id, destination_wallet_address, schedule_id, time_tracking_mode, employment_start_date,
          onboarding_status, onboarding_method, claimed_at, circle_user_id, circle_wallet_id, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        employee.id,
        employee.companyId,
        employee.walletAddress,
        employee.name,
        employee.role,
        employee.payType,
        employee.rateCents,
        employee.chainPreference,
        employee.destinationChainId,
        employee.destinationWalletAddress,
        employee.scheduleId,
        employee.timeTrackingMode,
        employee.employmentStartDate,
        employee.onboardingStatus,
        employee.onboardingMethod,
        employee.claimedAt,
        employee.circleUserId,
        employee.circleWalletId,
        Number(employee.active),
      );
    return employee;
  }

  updateEmployee(id: string, patch: Partial<EmployeeRecord>) {
    const current = this.getEmployee(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this.db
      .prepare(
        `UPDATE employees
         SET company_id = ?, wallet_address = ?, name = ?, role = ?, pay_type = ?, rate_cents = ?,
             chain_preference = ?, destination_chain_id = ?, destination_wallet_address = ?, schedule_id = ?,
             time_tracking_mode = ?, employment_start_date = ?, onboarding_status = ?, onboarding_method = ?,
             claimed_at = ?, circle_user_id = ?, circle_wallet_id = ?, active = ?
         WHERE id = ?`,
      )
      .run(
        next.companyId,
        next.walletAddress,
        next.name,
        next.role,
        next.payType,
        next.rateCents,
        next.chainPreference,
        next.destinationChainId,
        next.destinationWalletAddress,
        next.scheduleId,
        next.timeTrackingMode,
        next.employmentStartDate,
        next.onboardingStatus,
        next.onboardingMethod,
        next.claimedAt,
        next.circleUserId,
        next.circleWalletId,
        Number(next.active),
        id,
      );
    return next;
  }

  deactivateEmployee(id: string) {
    this.db.prepare("UPDATE employees SET active = 0 WHERE id = ?").run(id);
  }

  deleteSessionsByAddress(address: string) {
    this.db.prepare("DELETE FROM sessions WHERE address = ?").run(address.toLowerCase());
  }

  listHolidays() {
    return (this.db.prepare("SELECT * FROM holidays ORDER BY date ASC").all() as Record<string, unknown>[]).map(
      mapHoliday,
    );
  }

  createHoliday(holiday: HolidayRecord) {
    this.db.prepare("INSERT INTO holidays (id, company_id, date, name) VALUES (?, ?, ?, ?)").run(
      holiday.id,
      holiday.companyId,
      holiday.date,
      holiday.name,
    );
    return holiday;
  }

  updateHoliday(id: string, patch: Partial<HolidayRecord>) {
    const current = (
      this.db.prepare("SELECT * FROM holidays WHERE id = ?").get(id) as Record<string, unknown> | undefined
    );
    if (!current) return null;
    const next = { ...mapHoliday(current), ...patch, id };
    this.db.prepare("UPDATE holidays SET company_id = ?, date = ?, name = ? WHERE id = ?").run(
      next.companyId,
      next.date,
      next.name,
      id,
    );
    return next;
  }

  listTimeEntries(employeeId: string, start?: string, end?: string) {
    let sql = "SELECT * FROM time_entries WHERE employee_id = ?";
    const params: Array<string> = [employeeId];
    if (start) {
      sql += " AND date >= ?";
      params.push(start);
    }
    if (end) {
      sql += " AND date <= ?";
      params.push(end);
    }
    sql += " ORDER BY date ASC, clock_in ASC";
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapTimeEntry);
  }

  getOpenTimeEntry(employeeId: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL ORDER BY date DESC, clock_in DESC LIMIT 1",
      )
      .get(employeeId) as Record<string, unknown> | undefined;
    return row ? mapTimeEntry(row) : null;
  }

  createTimeEntry(timeEntry: TimeEntryRecord) {
    this.db
      .prepare(
        "INSERT INTO time_entries (id, employee_id, date, clock_in, clock_out, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        timeEntry.id,
        timeEntry.employeeId,
        timeEntry.date,
        timeEntry.clockIn,
        timeEntry.clockOut,
        timeEntry.createdAt,
      );
    return timeEntry;
  }

  closeTimeEntry(id: string, clockOut: string) {
    const current = (
      this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as Record<string, unknown> | undefined
    );
    if (!current) return null;
    this.db.prepare("UPDATE time_entries SET clock_out = ? WHERE id = ?").run(clockOut, id);
    return { ...mapTimeEntry(current), clockOut };
  }

  listPayRuns(status?: string) {
    if (status) {
      return (
        this.db.prepare("SELECT * FROM pay_runs WHERE status = ? ORDER BY period_start DESC").all(status) as Record<
          string,
          unknown
        >[]
      ).map(mapPayRun);
    }

    return (this.db.prepare("SELECT * FROM pay_runs ORDER BY period_start DESC").all() as Record<string, unknown>[]).map(
      mapPayRun,
    );
  }

  getPayRun(id: string) {
    const row = this.db.prepare("SELECT * FROM pay_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapPayRun(row) : null;
  }

  createPayRun(payRun: PayRunRecord, items: PayRunItemRecord[]) {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO pay_runs (
            id, company_id, on_chain_id, period_start, period_end, status, total_amount_cents,
            executed_at, tx_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          payRun.id,
          payRun.companyId,
          payRun.onChainId,
          payRun.periodStart,
          payRun.periodEnd,
          payRun.status,
          payRun.totalAmountCents,
          payRun.executedAt,
          payRun.txHash,
          payRun.createdAt,
          payRun.updatedAt,
        );

      const insertItem = this.db.prepare(
        `INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents,
          max_fee_base_units, min_finality_threshold, use_forwarder, bridge_nonce, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of items) {
        insertItem.run(
          item.id,
          item.payRunId,
          item.employeeId,
          item.recipientWalletAddress,
          item.destinationChainId,
          item.amountCents,
          item.maxFeeBaseUnits,
          item.minFinalityThreshold,
          Number(item.useForwarder),
          item.bridgeNonce,
          item.status,
          item.txHash,
        );
      }
    });
    return payRun;
  }

  updatePayRun(id: string, patch: Partial<PayRunRecord>) {
    const current = this.getPayRun(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this.db
      .prepare(
        `UPDATE pay_runs
         SET company_id = ?, on_chain_id = ?, period_start = ?, period_end = ?, status = ?, total_amount_cents = ?,
             executed_at = ?, tx_hash = ?, created_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.companyId,
        next.onChainId,
        next.periodStart,
        next.periodEnd,
        next.status,
        next.totalAmountCents,
        next.executedAt,
        next.txHash,
        next.createdAt,
        next.updatedAt,
        id,
      );
    return next;
  }

  replacePayRunItems(payRunId: string, items: PayRunItemRecord[]) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM pay_run_items WHERE pay_run_id = ?").run(payRunId);
      const insertItem = this.db.prepare(
        `INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents,
          max_fee_base_units, min_finality_threshold, use_forwarder, bridge_nonce, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of items) {
        insertItem.run(
          item.id,
          item.payRunId,
          item.employeeId,
          item.recipientWalletAddress,
          item.destinationChainId,
          item.amountCents,
          item.maxFeeBaseUnits,
          item.minFinalityThreshold,
          Number(item.useForwarder),
          item.bridgeNonce,
          item.status,
          item.txHash,
        );
      }
    });
  }

  listPayRunItems(payRunId?: string) {
    const rows = payRunId
      ? (this.db
          .prepare("SELECT * FROM pay_run_items WHERE pay_run_id = ? ORDER BY id ASC")
          .all(payRunId) as Record<string, unknown>[])
      : (this.db.prepare("SELECT * FROM pay_run_items ORDER BY id ASC").all() as Record<string, unknown>[]);
    return rows.map(mapPayRunItem);
  }

  updatePayRunItem(id: string, patch: Partial<PayRunItemRecord>) {
    const currentRow = this.db
      .prepare("SELECT * FROM pay_run_items WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!currentRow) return null;
    const next = { ...mapPayRunItem(currentRow), ...patch, id };
    this.db
      .prepare(
        `UPDATE pay_run_items
         SET pay_run_id = ?, employee_id = ?, recipient_wallet_address = ?, destination_chain_id = ?,
             amount_cents = ?, max_fee_base_units = ?, min_finality_threshold = ?, use_forwarder = ?,
             bridge_nonce = ?, status = ?, tx_hash = ?
         WHERE id = ?`,
      )
      .run(
        next.payRunId,
        next.employeeId,
        next.recipientWalletAddress,
        next.destinationChainId,
        next.amountCents,
        next.maxFeeBaseUnits,
        next.minFinalityThreshold,
        Number(next.useForwarder),
        next.bridgeNonce,
        next.status,
        next.txHash,
        id,
      );
    return next;
  }

  listPolicies() {
    return (this.db.prepare("SELECT * FROM policies ORDER BY name ASC").all() as Record<string, unknown>[]).map(
      mapPolicy,
    );
  }

  createPolicy(policy: PolicyRecord) {
    this.db
      .prepare(
        "INSERT INTO policies (id, company_id, name, type, status, config_json, last_run_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        policy.id,
        policy.companyId,
        policy.name,
        policy.type,
        policy.status,
        JSON.stringify(policy.config),
        policy.lastRunAt,
      );
    return policy;
  }

  updatePolicy(id: string, patch: Partial<PolicyRecord>) {
    const currentRow = this.db.prepare("SELECT * FROM policies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!currentRow) return null;
    const next = { ...mapPolicy(currentRow), ...patch, id };
    this.db
      .prepare(
        "UPDATE policies SET company_id = ?, name = ?, type = ?, status = ?, config_json = ?, last_run_at = ? WHERE id = ?",
      )
      .run(
        next.companyId,
        next.name,
        next.type,
        next.status,
        JSON.stringify(next.config),
        next.lastRunAt,
        id,
      );
    return next;
  }

  storeChallenge(record: AuthChallengeRecord) {
    this.db
      .prepare(
        `INSERT INTO auth_challenges (address, nonce, message, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET nonce = excluded.nonce, message = excluded.message, expires_at = excluded.expires_at`,
      )
      .run(record.address, record.nonce, record.message, record.expiresAt);
    return record;
  }

  getChallenge(address: string) {
    const row = this.db
      .prepare("SELECT * FROM auth_challenges WHERE address = ?")
      .get(address) as Record<string, unknown> | undefined;
    return row ? mapChallenge(row) : null;
  }

  deleteChallenge(address: string) {
    this.db.prepare("DELETE FROM auth_challenges WHERE address = ?").run(address);
  }

  createEmployeeInviteCode(record: EmployeeInviteCodeRecord) {
    this.db
      .prepare(
        `INSERT INTO employee_invite_codes (
          id, employee_id, code_hash, created_by, created_at, expires_at, used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.employeeId,
        record.codeHash,
        record.createdBy,
        record.createdAt,
        record.expiresAt,
        record.usedAt,
      );
    return record;
  }

  listEmployeeInviteCodes(employeeId?: string) {
    const rows = employeeId
      ? (this.db
          .prepare("SELECT * FROM employee_invite_codes WHERE employee_id = ? ORDER BY created_at DESC")
          .all(employeeId) as Record<string, unknown>[])
      : (this.db
          .prepare("SELECT * FROM employee_invite_codes ORDER BY created_at DESC")
          .all() as Record<string, unknown>[]);
    return rows.map(mapEmployeeInviteCode);
  }

  getEmployeeInviteCodeByHash(codeHash: string) {
    const row = this.db
      .prepare("SELECT * FROM employee_invite_codes WHERE code_hash = ? LIMIT 1")
      .get(codeHash) as Record<string, unknown> | undefined;
    return row ? mapEmployeeInviteCode(row) : null;
  }

  getActiveEmployeeInviteCode(employeeId: string, nowIso: string) {
    const row = this.db
      .prepare(
        `SELECT * FROM employee_invite_codes
         WHERE employee_id = ? AND used_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(employeeId, nowIso) as Record<string, unknown> | undefined;
    return row ? mapEmployeeInviteCode(row) : null;
  }

  invalidateActiveInviteCodes(employeeId: string, nowIso: string) {
    this.db
      .prepare("UPDATE employee_invite_codes SET used_at = ? WHERE employee_id = ? AND used_at IS NULL")
      .run(nowIso, employeeId);
  }

  useEmployeeInviteCode(id: string, usedAt: string) {
    this.db.prepare("UPDATE employee_invite_codes SET used_at = ? WHERE id = ?").run(usedAt, id);
  }

  createSession(record: SessionRecord) {
    this.db
      .prepare(
        `INSERT INTO sessions (token, address, role, employee_id, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET address = excluded.address, role = excluded.role, employee_id = excluded.employee_id, expires_at = excluded.expires_at`,
      )
      .run(record.token, record.address, record.role, record.employeeId, record.expiresAt);
    return record;
  }

  getSession(token: string) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as Record<string, unknown> | undefined;
    return row ? mapSession(row) : null;
  }

  deleteSession(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  purgeExpiredSessions(nowIso: string) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso);
      this.db.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").run(nowIso);
    });
  }

  listWithdrawals(employeeId?: string) {
    const rows = employeeId
      ? (this.db
          .prepare("SELECT * FROM withdrawals WHERE employee_id = ? ORDER BY created_at DESC")
          .all(employeeId) as Record<string, unknown>[])
      : (this.db.prepare("SELECT * FROM withdrawals ORDER BY created_at DESC").all() as Record<string, unknown>[]);
    return rows.map(mapWithdrawal);
  }

  createWithdrawal(withdrawal: WithdrawalRecord) {
    this.db
      .prepare(
        `INSERT INTO withdrawals (
          id, employee_id, wallet_address, amount_cents, tx_hash, period_start, period_end, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        withdrawal.id,
        withdrawal.employeeId,
        withdrawal.walletAddress,
        withdrawal.amountCents,
        withdrawal.txHash,
        withdrawal.periodStart,
        withdrawal.periodEnd,
        withdrawal.createdAt,
        withdrawal.status,
      );
    return withdrawal;
  }

  listTimeOffRequests(employeeId?: string) {
    const rows = employeeId
      ? (this.db
          .prepare("SELECT * FROM time_off_requests WHERE employee_id = ? ORDER BY date ASC, created_at ASC")
          .all(employeeId) as Record<string, unknown>[])
      : (this.db
          .prepare("SELECT * FROM time_off_requests ORDER BY date ASC, created_at ASC")
          .all() as Record<string, unknown>[]);
    return rows.map(mapTimeOffRequest);
  }

  getTimeOffRequest(id: string) {
    const row = this.db
      .prepare("SELECT * FROM time_off_requests WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapTimeOffRequest(row) : null;
  }

  createTimeOffRequest(request: TimeOffRequestRecord) {
    this.db
      .prepare(
        `INSERT INTO time_off_requests (
          id, company_id, employee_id, date, note, status, created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        request.id,
        request.companyId,
        request.employeeId,
        request.date,
        request.note,
        request.status,
        request.createdAt,
        request.updatedAt,
        request.reviewedAt,
      );
    return request;
  }

  updateTimeOffRequest(id: string, patch: Partial<TimeOffRequestRecord>) {
    const current = this.getTimeOffRequest(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this.db
      .prepare(
        `UPDATE time_off_requests
         SET company_id = ?, employee_id = ?, date = ?, note = ?, status = ?, created_at = ?, updated_at = ?, reviewed_at = ?
         WHERE id = ?`,
      )
      .run(
        next.companyId,
        next.employeeId,
        next.date,
        next.note,
        next.status,
        next.createdAt,
        next.updatedAt,
        next.reviewedAt,
        id,
      );
    return next;
  }
}
