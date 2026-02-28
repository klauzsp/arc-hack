"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayrollRepository = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const seeds_1 = require("./domain/seeds");
function toNumber(value) {
    return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
function toBoolean(value) {
    return toNumber(value) !== 0;
}
function parseJson(value, fallback) {
    if (typeof value !== "string")
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function mapCompany(row) {
    return {
        id: String(row.id),
        name: String(row.name),
        payFrequency: "semimonthly",
        defaultTimeTrackingMode: row.default_time_tracking_mode,
        treasuryUsycCents: toNumber(row.treasury_usyc_cents),
        autoRebalanceEnabled: toBoolean(row.auto_rebalance_enabled),
        autoRedeemEnabled: toBoolean(row.auto_redeem_enabled),
        rebalanceThresholdCents: toNumber(row.rebalance_threshold_cents),
        payoutNoticeHours: toNumber(row.payout_notice_hours),
        maxTimeOffDaysPerYear: toNumber(row.max_time_off_days_per_year),
    };
}
function mapTreasuryBalance(row) {
    return {
        companyId: String(row.company_id),
        chainId: toNumber(row.chain_id),
        chainName: String(row.chain_name),
        usdcCents: toNumber(row.usdc_cents),
        isHub: toBoolean(row.is_hub),
    };
}
function mapSchedule(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        name: String(row.name),
        timezone: String(row.timezone),
        startTime: String(row.start_time),
        hoursPerDay: toNumber(row.hours_per_day),
        workingDays: parseJson(row.working_days_json, []),
    };
}
function mapEmployee(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        walletAddress: String(row.wallet_address),
        name: String(row.name),
        role: "employee",
        payType: row.pay_type,
        rateCents: toNumber(row.rate_cents),
        chainPreference: row.chain_preference == null ? null : String(row.chain_preference),
        destinationChainId: row.destination_chain_id == null ? null : toNumber(row.destination_chain_id),
        destinationWalletAddress: row.destination_wallet_address == null ? null : String(row.destination_wallet_address),
        scheduleId: row.schedule_id == null ? null : String(row.schedule_id),
        timeTrackingMode: row.time_tracking_mode,
        employmentStartDate: row.employment_start_date == null ? null : String(row.employment_start_date),
        active: toBoolean(row.active),
    };
}
function mapHoliday(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        date: String(row.date),
        name: String(row.name),
    };
}
function mapTimeEntry(row) {
    return {
        id: String(row.id),
        employeeId: String(row.employee_id),
        date: String(row.date),
        clockIn: String(row.clock_in),
        clockOut: row.clock_out == null ? null : String(row.clock_out),
        createdAt: String(row.created_at),
    };
}
function mapPayRun(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        onChainId: row.on_chain_id == null ? null : String(row.on_chain_id),
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        status: row.status,
        totalAmountCents: toNumber(row.total_amount_cents),
        executedAt: row.executed_at == null ? null : String(row.executed_at),
        txHash: row.tx_hash == null ? null : String(row.tx_hash),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}
function mapPayRunItem(row) {
    return {
        id: String(row.id),
        payRunId: String(row.pay_run_id),
        employeeId: String(row.employee_id),
        recipientWalletAddress: String(row.recipient_wallet_address),
        destinationChainId: toNumber(row.destination_chain_id),
        amountCents: toNumber(row.amount_cents),
        status: String(row.status),
        txHash: row.tx_hash == null ? null : String(row.tx_hash),
    };
}
function mapPolicy(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        name: String(row.name),
        type: row.type,
        status: row.status,
        config: parseJson(row.config_json, {}),
        lastRunAt: row.last_run_at == null ? null : String(row.last_run_at),
    };
}
function mapChallenge(row) {
    return {
        address: String(row.address),
        nonce: String(row.nonce),
        message: String(row.message),
        expiresAt: String(row.expires_at),
    };
}
function mapSession(row) {
    return {
        token: String(row.token),
        address: String(row.address),
        role: row.role,
        employeeId: row.employee_id == null ? null : String(row.employee_id),
        expiresAt: String(row.expires_at),
    };
}
function mapWithdrawal(row) {
    return {
        id: String(row.id),
        employeeId: String(row.employee_id),
        walletAddress: String(row.wallet_address),
        amountCents: toNumber(row.amount_cents),
        txHash: row.tx_hash == null ? null : String(row.tx_hash),
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        createdAt: String(row.created_at),
        status: row.status,
    };
}
function mapTimeOffRequest(row) {
    return {
        id: String(row.id),
        companyId: String(row.company_id),
        employeeId: String(row.employee_id),
        date: String(row.date),
        note: row.note == null ? null : String(row.note),
        status: row.status,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
    };
}
class PayrollRepository {
    dbPath;
    db;
    demoPayRunIds = ["pr-1", "pr-2", "pr-3", "pr-4", "pr-5"];
    constructor(dbPath) {
        this.dbPath = dbPath;
        if (dbPath !== ":memory:") {
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(dbPath), { recursive: true });
        }
        this.db = new node_sqlite_1.DatabaseSync(dbPath);
        this.db.exec("PRAGMA foreign_keys = ON;");
        this.createSchema();
    }
    close() {
        this.db.close();
    }
    createSchema() {
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
    `);
        this.ensureColumn("employees", "employment_start_date", "TEXT");
        this.ensureColumn("companies", "max_time_off_days_per_year", "INTEGER NOT NULL DEFAULT 20");
        this.ensureColumn("schedules", "start_time", "TEXT NOT NULL DEFAULT '09:00'");
    }
    ensureColumn(table, column, definition) {
        const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
        if (columns.some((entry) => String(entry.name) === column))
            return;
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    transaction(callback) {
        this.db.exec("BEGIN");
        try {
            const result = callback();
            this.db.exec("COMMIT");
            return result;
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    removeDemoPayRuns() {
        const placeholders = this.demoPayRunIds.map(() => "?").join(", ");
        this.transaction(() => {
            this.db.prepare(`DELETE FROM pay_run_items WHERE pay_run_id IN (${placeholders})`).run(...this.demoPayRunIds);
            this.db.prepare(`DELETE FROM pay_runs WHERE id IN (${placeholders})`).run(...this.demoPayRunIds);
        });
    }
    initialize(seedInput) {
        const row = this.db.prepare("SELECT COUNT(*) AS count FROM companies").get();
        if (toNumber(row.count) > 0) {
            this.removeDemoPayRuns();
            return;
        }
        const payload = (0, seeds_1.createSeedPayload)(seedInput);
        this.transaction(() => {
            this.db
                .prepare(`INSERT INTO companies (
            id, name, pay_frequency, default_time_tracking_mode, treasury_usyc_cents,
            auto_rebalance_enabled, auto_redeem_enabled, rebalance_threshold_cents, payout_notice_hours,
            max_time_off_days_per_year
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(payload.company.id, payload.company.name, payload.company.payFrequency, payload.company.defaultTimeTrackingMode, payload.company.treasuryUsycCents, Number(payload.company.autoRebalanceEnabled), Number(payload.company.autoRedeemEnabled), payload.company.rebalanceThresholdCents, payload.company.payoutNoticeHours, payload.company.maxTimeOffDaysPerYear);
            const insertTreasury = this.db.prepare("INSERT INTO treasury_balances (company_id, chain_id, chain_name, usdc_cents, is_hub) VALUES (?, ?, ?, ?, ?)");
            for (const balance of payload.treasuryBalances) {
                insertTreasury.run(balance.companyId, balance.chainId, balance.chainName, balance.usdcCents, Number(balance.isHub));
            }
            const insertSchedule = this.db.prepare("INSERT INTO schedules (id, company_id, name, timezone, start_time, hours_per_day, working_days_json) VALUES (?, ?, ?, ?, ?, ?, ?)");
            for (const schedule of payload.schedules) {
                insertSchedule.run(schedule.id, schedule.companyId, schedule.name, schedule.timezone, schedule.startTime, schedule.hoursPerDay, JSON.stringify(schedule.workingDays));
            }
            const insertEmployee = this.db.prepare(`INSERT INTO employees (
          id, company_id, wallet_address, name, role, pay_type, rate_cents, chain_preference,
          destination_chain_id, destination_wallet_address, schedule_id, time_tracking_mode, employment_start_date, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const employee of payload.employees) {
                insertEmployee.run(employee.id, employee.companyId, employee.walletAddress, employee.name, employee.role, employee.payType, employee.rateCents, employee.chainPreference, employee.destinationChainId, employee.destinationWalletAddress, employee.scheduleId, employee.timeTrackingMode, employee.employmentStartDate, Number(employee.active));
            }
            const insertHoliday = this.db.prepare("INSERT INTO holidays (id, company_id, date, name) VALUES (?, ?, ?, ?)");
            for (const holiday of payload.holidays) {
                insertHoliday.run(holiday.id, holiday.companyId, holiday.date, holiday.name);
            }
            const insertTimeEntry = this.db.prepare("INSERT INTO time_entries (id, employee_id, date, clock_in, clock_out, created_at) VALUES (?, ?, ?, ?, ?, ?)");
            for (const entry of payload.timeEntries) {
                insertTimeEntry.run(entry.id, entry.employeeId, entry.date, entry.clockIn, entry.clockOut, entry.createdAt);
            }
            const insertPayRun = this.db.prepare(`INSERT INTO pay_runs (
          id, company_id, on_chain_id, period_start, period_end, status, total_amount_cents,
          executed_at, tx_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const payRun of payload.payRuns) {
                insertPayRun.run(payRun.id, payRun.companyId, payRun.onChainId, payRun.periodStart, payRun.periodEnd, payRun.status, payRun.totalAmountCents, payRun.executedAt, payRun.txHash, payRun.createdAt, payRun.updatedAt);
            }
            const insertPayRunItem = this.db.prepare(`INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const item of payload.payRunItems) {
                insertPayRunItem.run(item.id, item.payRunId, item.employeeId, item.recipientWalletAddress, item.destinationChainId, item.amountCents, item.status, item.txHash);
            }
            const insertPolicy = this.db.prepare("INSERT INTO policies (id, company_id, name, type, status, config_json, last_run_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
            for (const policy of payload.policies) {
                insertPolicy.run(policy.id, policy.companyId, policy.name, policy.type, policy.status, JSON.stringify(policy.config), policy.lastRunAt);
            }
            const insertWithdrawal = this.db.prepare(`INSERT INTO withdrawals (
          id, employee_id, wallet_address, amount_cents, tx_hash, period_start, period_end, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const withdrawal of payload.withdrawals ?? []) {
                insertWithdrawal.run(withdrawal.id, withdrawal.employeeId, withdrawal.walletAddress, withdrawal.amountCents, withdrawal.txHash, withdrawal.periodStart, withdrawal.periodEnd, withdrawal.createdAt, withdrawal.status);
            }
            const insertTimeOffRequest = this.db.prepare(`INSERT INTO time_off_requests (
          id, company_id, employee_id, date, note, status, created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const request of payload.timeOffRequests ?? []) {
                insertTimeOffRequest.run(request.id, request.companyId, request.employeeId, request.date, request.note, request.status, request.createdAt, request.updatedAt, request.reviewedAt);
            }
        });
        this.removeDemoPayRuns();
    }
    getCompany() {
        const row = this.db.prepare("SELECT * FROM companies LIMIT 1").get();
        return row ? mapCompany(row) : null;
    }
    updateCompany(company) {
        this.db
            .prepare(`UPDATE companies
         SET name = ?, pay_frequency = ?, default_time_tracking_mode = ?, treasury_usyc_cents = ?,
             auto_rebalance_enabled = ?, auto_redeem_enabled = ?, rebalance_threshold_cents = ?, payout_notice_hours = ?,
             max_time_off_days_per_year = ?
         WHERE id = ?`)
            .run(company.name, company.payFrequency, company.defaultTimeTrackingMode, company.treasuryUsycCents, Number(company.autoRebalanceEnabled), Number(company.autoRedeemEnabled), company.rebalanceThresholdCents, company.payoutNoticeHours, company.maxTimeOffDaysPerYear, company.id);
    }
    listTreasuryBalances() {
        return this.db
            .prepare("SELECT * FROM treasury_balances ORDER BY is_hub DESC, chain_name ASC")
            .all().map(mapTreasuryBalance);
    }
    getTreasuryBalance(chainId) {
        const row = this.db
            .prepare("SELECT * FROM treasury_balances WHERE chain_id = ?")
            .get(chainId);
        return row ? mapTreasuryBalance(row) : null;
    }
    updateTreasuryBalance(chainId, usdcCents) {
        this.db.prepare("UPDATE treasury_balances SET usdc_cents = ? WHERE chain_id = ?").run(usdcCents, chainId);
    }
    listSchedules() {
        return this.db.prepare("SELECT * FROM schedules ORDER BY name ASC").all().map(mapSchedule);
    }
    getSchedule(id) {
        const row = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
        return row ? mapSchedule(row) : null;
    }
    createSchedule(schedule) {
        this.db
            .prepare("INSERT INTO schedules (id, company_id, name, timezone, start_time, hours_per_day, working_days_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(schedule.id, schedule.companyId, schedule.name, schedule.timezone, schedule.startTime, schedule.hoursPerDay, JSON.stringify(schedule.workingDays));
        return schedule;
    }
    updateSchedule(id, patch) {
        const current = this.getSchedule(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.db
            .prepare("UPDATE schedules SET company_id = ?, name = ?, timezone = ?, start_time = ?, hours_per_day = ?, working_days_json = ? WHERE id = ?")
            .run(next.companyId, next.name, next.timezone, next.startTime, next.hoursPerDay, JSON.stringify(next.workingDays), id);
        return next;
    }
    listEmployees(includeInactive = false) {
        const sql = includeInactive
            ? "SELECT * FROM employees ORDER BY name ASC"
            : "SELECT * FROM employees WHERE active = 1 ORDER BY name ASC";
        return this.db.prepare(sql).all().map(mapEmployee);
    }
    getEmployee(id) {
        const row = this.db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
        return row ? mapEmployee(row) : null;
    }
    getEmployeeByWallet(walletAddress) {
        return this.getEmployeeByWalletInternal(walletAddress, false);
    }
    getEmployeeByWalletInternal(walletAddress, includeInactive) {
        const row = this.db
            .prepare(includeInactive
            ? "SELECT * FROM employees WHERE wallet_address = ?"
            : "SELECT * FROM employees WHERE wallet_address = ? AND active = 1")
            .get(walletAddress.toLowerCase());
        return row ? mapEmployee(row) : null;
    }
    getEmployeeByWalletIncludingInactive(walletAddress) {
        return this.getEmployeeByWalletInternal(walletAddress, true);
    }
    createEmployee(employee) {
        this.db
            .prepare(`INSERT INTO employees (
          id, company_id, wallet_address, name, role, pay_type, rate_cents, chain_preference,
          destination_chain_id, destination_wallet_address, schedule_id, time_tracking_mode, employment_start_date, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(employee.id, employee.companyId, employee.walletAddress, employee.name, employee.role, employee.payType, employee.rateCents, employee.chainPreference, employee.destinationChainId, employee.destinationWalletAddress, employee.scheduleId, employee.timeTrackingMode, employee.employmentStartDate, Number(employee.active));
        return employee;
    }
    updateEmployee(id, patch) {
        const current = this.getEmployee(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.db
            .prepare(`UPDATE employees
         SET company_id = ?, wallet_address = ?, name = ?, role = ?, pay_type = ?, rate_cents = ?,
             chain_preference = ?, destination_chain_id = ?, destination_wallet_address = ?, schedule_id = ?,
             time_tracking_mode = ?, employment_start_date = ?, active = ?
         WHERE id = ?`)
            .run(next.companyId, next.walletAddress, next.name, next.role, next.payType, next.rateCents, next.chainPreference, next.destinationChainId, next.destinationWalletAddress, next.scheduleId, next.timeTrackingMode, next.employmentStartDate, Number(next.active), id);
        return next;
    }
    deactivateEmployee(id) {
        this.db.prepare("UPDATE employees SET active = 0 WHERE id = ?").run(id);
    }
    deleteSessionsByAddress(address) {
        this.db.prepare("DELETE FROM sessions WHERE address = ?").run(address.toLowerCase());
    }
    listHolidays() {
        return this.db.prepare("SELECT * FROM holidays ORDER BY date ASC").all().map(mapHoliday);
    }
    createHoliday(holiday) {
        this.db.prepare("INSERT INTO holidays (id, company_id, date, name) VALUES (?, ?, ?, ?)").run(holiday.id, holiday.companyId, holiday.date, holiday.name);
        return holiday;
    }
    updateHoliday(id, patch) {
        const current = this.db.prepare("SELECT * FROM holidays WHERE id = ?").get(id);
        if (!current)
            return null;
        const next = { ...mapHoliday(current), ...patch, id };
        this.db.prepare("UPDATE holidays SET company_id = ?, date = ?, name = ? WHERE id = ?").run(next.companyId, next.date, next.name, id);
        return next;
    }
    listTimeEntries(employeeId, start, end) {
        let sql = "SELECT * FROM time_entries WHERE employee_id = ?";
        const params = [employeeId];
        if (start) {
            sql += " AND date >= ?";
            params.push(start);
        }
        if (end) {
            sql += " AND date <= ?";
            params.push(end);
        }
        sql += " ORDER BY date ASC, clock_in ASC";
        return this.db.prepare(sql).all(...params).map(mapTimeEntry);
    }
    getOpenTimeEntry(employeeId) {
        const row = this.db
            .prepare("SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL ORDER BY date DESC, clock_in DESC LIMIT 1")
            .get(employeeId);
        return row ? mapTimeEntry(row) : null;
    }
    createTimeEntry(timeEntry) {
        this.db
            .prepare("INSERT INTO time_entries (id, employee_id, date, clock_in, clock_out, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .run(timeEntry.id, timeEntry.employeeId, timeEntry.date, timeEntry.clockIn, timeEntry.clockOut, timeEntry.createdAt);
        return timeEntry;
    }
    closeTimeEntry(id, clockOut) {
        const current = this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id);
        if (!current)
            return null;
        this.db.prepare("UPDATE time_entries SET clock_out = ? WHERE id = ?").run(clockOut, id);
        return { ...mapTimeEntry(current), clockOut };
    }
    listPayRuns(status) {
        if (status) {
            return this.db.prepare("SELECT * FROM pay_runs WHERE status = ? ORDER BY period_start DESC").all(status).map(mapPayRun);
        }
        return this.db.prepare("SELECT * FROM pay_runs ORDER BY period_start DESC").all().map(mapPayRun);
    }
    getPayRun(id) {
        const row = this.db.prepare("SELECT * FROM pay_runs WHERE id = ?").get(id);
        return row ? mapPayRun(row) : null;
    }
    createPayRun(payRun, items) {
        this.transaction(() => {
            this.db
                .prepare(`INSERT INTO pay_runs (
            id, company_id, on_chain_id, period_start, period_end, status, total_amount_cents,
            executed_at, tx_hash, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(payRun.id, payRun.companyId, payRun.onChainId, payRun.periodStart, payRun.periodEnd, payRun.status, payRun.totalAmountCents, payRun.executedAt, payRun.txHash, payRun.createdAt, payRun.updatedAt);
            const insertItem = this.db.prepare(`INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const item of items) {
                insertItem.run(item.id, item.payRunId, item.employeeId, item.recipientWalletAddress, item.destinationChainId, item.amountCents, item.status, item.txHash);
            }
        });
        return payRun;
    }
    updatePayRun(id, patch) {
        const current = this.getPayRun(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.db
            .prepare(`UPDATE pay_runs
         SET company_id = ?, on_chain_id = ?, period_start = ?, period_end = ?, status = ?, total_amount_cents = ?,
             executed_at = ?, tx_hash = ?, created_at = ?, updated_at = ?
         WHERE id = ?`)
            .run(next.companyId, next.onChainId, next.periodStart, next.periodEnd, next.status, next.totalAmountCents, next.executedAt, next.txHash, next.createdAt, next.updatedAt, id);
        return next;
    }
    replacePayRunItems(payRunId, items) {
        this.transaction(() => {
            this.db.prepare("DELETE FROM pay_run_items WHERE pay_run_id = ?").run(payRunId);
            const insertItem = this.db.prepare(`INSERT INTO pay_run_items (
          id, pay_run_id, employee_id, recipient_wallet_address, destination_chain_id, amount_cents, status, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const item of items) {
                insertItem.run(item.id, item.payRunId, item.employeeId, item.recipientWalletAddress, item.destinationChainId, item.amountCents, item.status, item.txHash);
            }
        });
    }
    listPayRunItems(payRunId) {
        const rows = payRunId
            ? this.db
                .prepare("SELECT * FROM pay_run_items WHERE pay_run_id = ? ORDER BY id ASC")
                .all(payRunId)
            : this.db.prepare("SELECT * FROM pay_run_items ORDER BY id ASC").all();
        return rows.map(mapPayRunItem);
    }
    updatePayRunItem(id, patch) {
        const currentRow = this.db
            .prepare("SELECT * FROM pay_run_items WHERE id = ?")
            .get(id);
        if (!currentRow)
            return null;
        const next = { ...mapPayRunItem(currentRow), ...patch, id };
        this.db
            .prepare(`UPDATE pay_run_items
         SET pay_run_id = ?, employee_id = ?, recipient_wallet_address = ?, destination_chain_id = ?,
             amount_cents = ?, status = ?, tx_hash = ?
         WHERE id = ?`)
            .run(next.payRunId, next.employeeId, next.recipientWalletAddress, next.destinationChainId, next.amountCents, next.status, next.txHash, id);
        return next;
    }
    listPolicies() {
        return this.db.prepare("SELECT * FROM policies ORDER BY name ASC").all().map(mapPolicy);
    }
    createPolicy(policy) {
        this.db
            .prepare("INSERT INTO policies (id, company_id, name, type, status, config_json, last_run_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(policy.id, policy.companyId, policy.name, policy.type, policy.status, JSON.stringify(policy.config), policy.lastRunAt);
        return policy;
    }
    updatePolicy(id, patch) {
        const currentRow = this.db.prepare("SELECT * FROM policies WHERE id = ?").get(id);
        if (!currentRow)
            return null;
        const next = { ...mapPolicy(currentRow), ...patch, id };
        this.db
            .prepare("UPDATE policies SET company_id = ?, name = ?, type = ?, status = ?, config_json = ?, last_run_at = ? WHERE id = ?")
            .run(next.companyId, next.name, next.type, next.status, JSON.stringify(next.config), next.lastRunAt, id);
        return next;
    }
    storeChallenge(record) {
        this.db
            .prepare(`INSERT INTO auth_challenges (address, nonce, message, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET nonce = excluded.nonce, message = excluded.message, expires_at = excluded.expires_at`)
            .run(record.address, record.nonce, record.message, record.expiresAt);
        return record;
    }
    getChallenge(address) {
        const row = this.db
            .prepare("SELECT * FROM auth_challenges WHERE address = ?")
            .get(address);
        return row ? mapChallenge(row) : null;
    }
    deleteChallenge(address) {
        this.db.prepare("DELETE FROM auth_challenges WHERE address = ?").run(address);
    }
    createSession(record) {
        this.db
            .prepare(`INSERT INTO sessions (token, address, role, employee_id, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET address = excluded.address, role = excluded.role, employee_id = excluded.employee_id, expires_at = excluded.expires_at`)
            .run(record.token, record.address, record.role, record.employeeId, record.expiresAt);
        return record;
    }
    getSession(token) {
        const row = this.db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
        return row ? mapSession(row) : null;
    }
    deleteSession(token) {
        this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    purgeExpiredSessions(nowIso) {
        this.transaction(() => {
            this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso);
            this.db.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").run(nowIso);
        });
    }
    listWithdrawals(employeeId) {
        const rows = employeeId
            ? this.db
                .prepare("SELECT * FROM withdrawals WHERE employee_id = ? ORDER BY created_at DESC")
                .all(employeeId)
            : this.db.prepare("SELECT * FROM withdrawals ORDER BY created_at DESC").all();
        return rows.map(mapWithdrawal);
    }
    createWithdrawal(withdrawal) {
        this.db
            .prepare(`INSERT INTO withdrawals (
          id, employee_id, wallet_address, amount_cents, tx_hash, period_start, period_end, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(withdrawal.id, withdrawal.employeeId, withdrawal.walletAddress, withdrawal.amountCents, withdrawal.txHash, withdrawal.periodStart, withdrawal.periodEnd, withdrawal.createdAt, withdrawal.status);
        return withdrawal;
    }
    listTimeOffRequests(employeeId) {
        const rows = employeeId
            ? this.db
                .prepare("SELECT * FROM time_off_requests WHERE employee_id = ? ORDER BY date ASC, created_at ASC")
                .all(employeeId)
            : this.db
                .prepare("SELECT * FROM time_off_requests ORDER BY date ASC, created_at ASC")
                .all();
        return rows.map(mapTimeOffRequest);
    }
    getTimeOffRequest(id) {
        const row = this.db
            .prepare("SELECT * FROM time_off_requests WHERE id = ?")
            .get(id);
        return row ? mapTimeOffRequest(row) : null;
    }
    createTimeOffRequest(request) {
        this.db
            .prepare(`INSERT INTO time_off_requests (
          id, company_id, employee_id, date, note, status, created_at, updated_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(request.id, request.companyId, request.employeeId, request.date, request.note, request.status, request.createdAt, request.updatedAt, request.reviewedAt);
        return request;
    }
    updateTimeOffRequest(id, patch) {
        const current = this.getTimeOffRequest(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.db
            .prepare(`UPDATE time_off_requests
         SET company_id = ?, employee_id = ?, date = ?, note = ?, status = ?, created_at = ?, updated_at = ?, reviewed_at = ?
         WHERE id = ?`)
            .run(next.companyId, next.employeeId, next.date, next.note, next.status, next.createdAt, next.updatedAt, next.reviewedAt, id);
        return next;
    }
}
exports.PayrollRepository = PayrollRepository;
