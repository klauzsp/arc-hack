"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayrollRepository = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const seeds_1 = require("./domain/seeds");
function emptyState() {
    return {
        companies: [],
        treasuryBalances: [],
        schedules: [],
        employees: [],
        holidays: [],
        timeEntries: [],
        payRuns: [],
        payRunItems: [],
        policies: [],
        authChallenges: [],
        sessions: [],
    };
}
class PayrollRepository {
    dbPath;
    state = emptyState();
    constructor(dbPath) {
        this.dbPath = dbPath;
        if (dbPath !== ":memory:") {
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(dbPath), { recursive: true });
            if (node_fs_1.default.existsSync(dbPath)) {
                this.state = JSON.parse(node_fs_1.default.readFileSync(dbPath, "utf8"));
            }
        }
    }
    close() { }
    persist() {
        if (this.dbPath === ":memory:")
            return;
        node_fs_1.default.writeFileSync(this.dbPath, JSON.stringify(this.state, null, 2));
    }
    initialize(seedInput) {
        if (this.state.companies.length > 0)
            return;
        const payload = (0, seeds_1.createSeedPayload)(seedInput);
        this.state = {
            companies: [payload.company],
            treasuryBalances: payload.treasuryBalances,
            schedules: payload.schedules,
            employees: payload.employees,
            holidays: payload.holidays,
            timeEntries: payload.timeEntries,
            payRuns: payload.payRuns,
            payRunItems: payload.payRunItems,
            policies: payload.policies,
            authChallenges: [],
            sessions: [],
        };
        this.persist();
    }
    getCompany() {
        return this.state.companies[0] ?? null;
    }
    updateCompany(company) {
        this.state.companies = this.state.companies.map((entry) => (entry.id === company.id ? company : entry));
        this.persist();
    }
    listTreasuryBalances() {
        return [...this.state.treasuryBalances].sort((left, right) => Number(right.isHub) - Number(left.isHub) || left.chainName.localeCompare(right.chainName));
    }
    getTreasuryBalance(chainId) {
        return this.state.treasuryBalances.find((balance) => balance.chainId === chainId) ?? null;
    }
    updateTreasuryBalance(chainId, usdcCents) {
        this.state.treasuryBalances = this.state.treasuryBalances.map((balance) => balance.chainId === chainId ? { ...balance, usdcCents } : balance);
        this.persist();
    }
    listSchedules() {
        return [...this.state.schedules].sort((left, right) => left.name.localeCompare(right.name));
    }
    getSchedule(id) {
        return this.state.schedules.find((schedule) => schedule.id === id) ?? null;
    }
    createSchedule(schedule) {
        this.state.schedules.push(schedule);
        this.persist();
        return schedule;
    }
    updateSchedule(id, patch) {
        const current = this.getSchedule(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.schedules = this.state.schedules.map((schedule) => (schedule.id === id ? next : schedule));
        this.persist();
        return next;
    }
    listEmployees(includeInactive = false) {
        const employees = includeInactive ? this.state.employees : this.state.employees.filter((employee) => employee.active);
        return [...employees].sort((left, right) => left.name.localeCompare(right.name));
    }
    getEmployee(id) {
        return this.state.employees.find((employee) => employee.id === id) ?? null;
    }
    getEmployeeByWallet(walletAddress) {
        return this.state.employees.find((employee) => employee.walletAddress.toLowerCase() === walletAddress.toLowerCase()) ?? null;
    }
    createEmployee(employee) {
        this.state.employees.push(employee);
        this.persist();
        return employee;
    }
    updateEmployee(id, patch) {
        const current = this.getEmployee(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.employees = this.state.employees.map((employee) => (employee.id === id ? next : employee));
        this.persist();
        return next;
    }
    deactivateEmployee(id) {
        this.state.employees = this.state.employees.map((employee) => employee.id === id ? { ...employee, active: false } : employee);
        this.persist();
    }
    listHolidays() {
        return [...this.state.holidays].sort((left, right) => left.date.localeCompare(right.date));
    }
    createHoliday(holiday) {
        this.state.holidays.push(holiday);
        this.persist();
        return holiday;
    }
    updateHoliday(id, patch) {
        const current = this.state.holidays.find((holiday) => holiday.id === id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.holidays = this.state.holidays.map((holiday) => (holiday.id === id ? next : holiday));
        this.persist();
        return next;
    }
    listTimeEntries(employeeId, start, end) {
        return this.state.timeEntries
            .filter((entry) => {
            if (entry.employeeId !== employeeId)
                return false;
            if (start && entry.date < start)
                return false;
            if (end && entry.date > end)
                return false;
            return true;
        })
            .sort((left, right) => `${left.date}${left.clockIn}`.localeCompare(`${right.date}${right.clockIn}`));
    }
    getOpenTimeEntry(employeeId) {
        return this.state.timeEntries
            .filter((entry) => entry.employeeId === employeeId && !entry.clockOut)
            .sort((left, right) => `${right.date}${right.clockIn}`.localeCompare(`${left.date}${left.clockIn}`))[0] ?? null;
    }
    createTimeEntry(timeEntry) {
        this.state.timeEntries.push(timeEntry);
        this.persist();
        return timeEntry;
    }
    closeTimeEntry(id, clockOut) {
        let updated = null;
        this.state.timeEntries = this.state.timeEntries.map((entry) => {
            if (entry.id !== id)
                return entry;
            updated = { ...entry, clockOut };
            return updated;
        });
        this.persist();
        return updated;
    }
    listPayRuns(status) {
        return this.state.payRuns
            .filter((payRun) => (status ? payRun.status === status : true))
            .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
    }
    getPayRun(id) {
        return this.state.payRuns.find((payRun) => payRun.id === id) ?? null;
    }
    createPayRun(payRun, items) {
        this.state.payRuns.push(payRun);
        this.state.payRunItems.push(...items);
        this.persist();
        return payRun;
    }
    updatePayRun(id, patch) {
        const current = this.getPayRun(id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.payRuns = this.state.payRuns.map((payRun) => (payRun.id === id ? next : payRun));
        this.persist();
        return next;
    }
    replacePayRunItems(payRunId, items) {
        this.state.payRunItems = this.state.payRunItems.filter((item) => item.payRunId !== payRunId).concat(items);
        this.persist();
    }
    listPayRunItems(payRunId) {
        return this.state.payRunItems.filter((item) => (payRunId ? item.payRunId === payRunId : true));
    }
    updatePayRunItem(id, patch) {
        const current = this.state.payRunItems.find((item) => item.id === id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.payRunItems = this.state.payRunItems.map((item) => (item.id === id ? next : item));
        this.persist();
        return next;
    }
    listPolicies() {
        return [...this.state.policies].sort((left, right) => left.name.localeCompare(right.name));
    }
    createPolicy(policy) {
        this.state.policies.push(policy);
        this.persist();
        return policy;
    }
    updatePolicy(id, patch) {
        const current = this.state.policies.find((policy) => policy.id === id);
        if (!current)
            return null;
        const next = { ...current, ...patch, id };
        this.state.policies = this.state.policies.map((policy) => (policy.id === id ? next : policy));
        this.persist();
        return next;
    }
    storeChallenge(record) {
        this.state.authChallenges = this.state.authChallenges.filter((challenge) => challenge.address !== record.address);
        this.state.authChallenges.push(record);
        this.persist();
        return record;
    }
    getChallenge(address) {
        return this.state.authChallenges.find((challenge) => challenge.address === address) ?? null;
    }
    deleteChallenge(address) {
        this.state.authChallenges = this.state.authChallenges.filter((challenge) => challenge.address !== address);
        this.persist();
    }
    createSession(record) {
        this.state.sessions = this.state.sessions.filter((session) => session.token !== record.token);
        this.state.sessions.push(record);
        this.persist();
        return record;
    }
    getSession(token) {
        return this.state.sessions.find((session) => session.token === token) ?? null;
    }
    deleteSession(token) {
        this.state.sessions = this.state.sessions.filter((session) => session.token !== token);
        this.persist();
    }
    purgeExpiredSessions(nowIso) {
        this.state.sessions = this.state.sessions.filter((session) => session.expiresAt > nowIso);
        this.state.authChallenges = this.state.authChallenges.filter((challenge) => challenge.expiresAt > nowIso);
        this.persist();
    }
}
exports.PayrollRepository = PayrollRepository;
