"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const accounts_1 = require("viem/accounts");
const app_1 = require("../src/app");
const config_1 = require("../src/config");
function createTestHarness(overrides = {}) {
    const config = (0, config_1.loadConfig)({
        ...process.env,
        BACKEND_DB_PATH: ":memory:",
        BACKEND_SEED_DATE: "2026-02-28",
        BACKEND_JOBS_ENABLED: "false",
        ...overrides,
    });
    const harness = (0, app_1.buildApp)(config);
    const employee = harness.repository.listEmployees()[0];
    harness.repository.createSession({
        token: "admin-token",
        address: config.adminWallet,
        role: "admin",
        employeeId: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
    });
    harness.repository.createSession({
        token: "employee-token",
        address: employee.walletAddress,
        role: "employee",
        employeeId: employee.id,
        expiresAt: "2099-01-01T00:00:00.000Z",
    });
    return { ...harness, config, employee };
}
(0, node_test_1.default)("dashboard and treasury endpoints return seeded summary data", async () => {
    const { app } = createTestHarness();
    const dashboard = await app.inject({ method: "GET", url: "/dashboard" });
    strict_1.default.equal(dashboard.statusCode, 200);
    const dashboardBody = dashboard.json();
    strict_1.default.equal(dashboardBody.today, "2026-02-28");
    strict_1.default.ok(dashboardBody.totalUsdc > 0);
    const treasury = await app.inject({ method: "GET", url: "/treasury/balances" });
    strict_1.default.equal(treasury.statusCode, 200);
    const treasuryBody = treasury.json();
    strict_1.default.ok(Array.isArray(treasuryBody.chainBalances));
    strict_1.default.ok(treasuryBody.chainBalances.length >= 1);
    await app.close();
});
(0, node_test_1.default)("admin can create, approve, and execute a pay run", async () => {
    const { app } = createTestHarness();
    const createResponse = await app.inject({
        method: "POST",
        url: "/pay-runs",
        headers: { authorization: "Bearer admin-token" },
        payload: {
            periodStart: "2026-03-01",
            periodEnd: "2026-03-15",
        },
    });
    strict_1.default.equal(createResponse.statusCode, 200);
    const createdPayRun = createResponse.json();
    strict_1.default.equal(createdPayRun.status, "draft");
    const approveResponse = await app.inject({
        method: "POST",
        url: `/pay-runs/${createdPayRun.id}/approve`,
        headers: { authorization: "Bearer admin-token" },
    });
    strict_1.default.equal(approveResponse.statusCode, 200);
    strict_1.default.equal(approveResponse.json().status, "approved");
    strict_1.default.ok(typeof approveResponse.json().onChainId === "string");
    const executeResponse = await app.inject({
        method: "POST",
        url: `/pay-runs/${createdPayRun.id}/execute`,
        headers: { authorization: "Bearer admin-token" },
    });
    strict_1.default.equal(executeResponse.statusCode, 200);
    const executedPayRun = executeResponse.json();
    strict_1.default.ok(["executed", "processing"].includes(executedPayRun.status));
    strict_1.default.ok(typeof executedPayRun.txHash === "string");
    if (executedPayRun.status === "processing") {
        const finalizeResponse = await app.inject({
            method: "POST",
            url: `/pay-runs/${createdPayRun.id}/finalize`,
            headers: { authorization: "Bearer admin-token" },
        });
        strict_1.default.equal(finalizeResponse.statusCode, 200);
        strict_1.default.equal(finalizeResponse.json().status, "executed");
    }
    await app.close();
});
(0, node_test_1.default)("admin can deactivate a recipient from the live recipient list", async () => {
    const { app, employee } = createTestHarness();
    const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/recipients/${employee.id}`,
        headers: { authorization: "Bearer admin-token" },
    });
    strict_1.default.equal(deleteResponse.statusCode, 200);
    strict_1.default.equal(deleteResponse.json().ok, true);
    const recipientsResponse = await app.inject({
        method: "GET",
        url: "/recipients",
        headers: { authorization: "Bearer admin-token" },
    });
    strict_1.default.equal(recipientsResponse.statusCode, 200);
    const recipients = recipientsResponse.json();
    strict_1.default.equal(recipients.some((recipient) => recipient.id === employee.id), false);
    const deletedEmployeeMe = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(deletedEmployeeMe.statusCode, 401);
    await app.close();
});
(0, node_test_1.default)("employee earnings and time routes are scoped to the signed-in wallet", async () => {
    const { app } = createTestHarness();
    const earningsResponse = await app.inject({
        method: "GET",
        url: "/me/earnings",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(earningsResponse.statusCode, 200);
    const earnings = earningsResponse.json();
    strict_1.default.ok(earnings.currentPeriod.earned >= 0);
    strict_1.default.ok(earnings.availableToWithdraw >= 0);
    const scheduleResponse = await app.inject({
        method: "GET",
        url: "/me/schedule",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(scheduleResponse.statusCode, 200);
    strict_1.default.ok(scheduleResponse.json().workingDays.length >= 1);
    await app.close();
});
(0, node_test_1.default)("employee can use custom clock times and withdraw earned wages from treasury", async () => {
    const { app, repository } = createTestHarness();
    const timeEmployee = repository.listEmployees().find((employee) => employee.timeTrackingMode === "check_in_out");
    strict_1.default.ok(timeEmployee);
    repository.createSession({
        token: "time-employee-token",
        address: timeEmployee.walletAddress,
        role: "employee",
        employeeId: timeEmployee.id,
        expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const beforeEarnings = await app.inject({
        method: "GET",
        url: "/me/earnings",
        headers: { authorization: "Bearer time-employee-token" },
    });
    strict_1.default.equal(beforeEarnings.statusCode, 200);
    const beforeAvailable = beforeEarnings.json().availableToWithdraw;
    strict_1.default.ok(beforeAvailable > 0);
    const clockInResponse = await app.inject({
        method: "POST",
        url: "/me/time-entries/clock-in",
        headers: { authorization: "Bearer time-employee-token" },
        payload: { date: "2026-02-28", clockIn: "10:15" },
    });
    strict_1.default.equal(clockInResponse.statusCode, 200);
    strict_1.default.equal(clockInResponse.json().clockIn, "10:15");
    const clockOutResponse = await app.inject({
        method: "POST",
        url: "/me/time-entries/clock-out",
        headers: { authorization: "Bearer time-employee-token" },
        payload: { clockOut: "18:05" },
    });
    strict_1.default.equal(clockOutResponse.statusCode, 200);
    strict_1.default.equal(clockOutResponse.json().clockOut, "18:05");
    const withdrawResponse = await app.inject({
        method: "POST",
        url: "/me/withdraw",
        headers: { authorization: "Bearer time-employee-token" },
        payload: {},
    });
    strict_1.default.equal(withdrawResponse.statusCode, 200);
    strict_1.default.ok(withdrawResponse.json().amount > 0);
    strict_1.default.equal(typeof withdrawResponse.json().txHash, "string");
    const afterEarnings = await app.inject({
        method: "GET",
        url: "/me/earnings",
        headers: { authorization: "Bearer time-employee-token" },
    });
    strict_1.default.equal(afterEarnings.statusCode, 200);
    strict_1.default.ok(afterEarnings.json().availableToWithdraw < beforeAvailable);
    await app.close();
});
(0, node_test_1.default)("schedule-based earnings accrue linearly during the workday", async () => {
    const { app } = createTestHarness({
        BACKEND_SEED_DATE: "2026-02-27",
        BACKEND_REFERENCE_NOW: "2026-02-27T18:00:00.000Z",
    });
    const earningsResponse = await app.inject({
        method: "GET",
        url: "/me/earnings",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(earningsResponse.statusCode, 200);
    const earnings = earningsResponse.json();
    strict_1.default.ok(earnings.breakdown.currentPeriodDays % 1 !== 0);
    strict_1.default.ok(earnings.currentPeriod.earned > 0);
    await app.close();
});
(0, node_test_1.default)("employee day-off requests honor the annual limit and can be moved without adding extra days", async () => {
    const { app } = createTestHarness();
    const policyResponse = await app.inject({
        method: "PATCH",
        url: "/time-off/policy",
        headers: { authorization: "Bearer admin-token" },
        payload: { maxDaysPerYear: 1 },
    });
    strict_1.default.equal(policyResponse.statusCode, 200);
    strict_1.default.equal(policyResponse.json().maxDaysPerYear, 1);
    const createResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-03", note: "Family event" },
    });
    strict_1.default.equal(createResponse.statusCode, 200);
    const created = createResponse.json();
    strict_1.default.equal(created.status, "pending");
    const secondCreateResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-04" },
    });
    strict_1.default.equal(secondCreateResponse.statusCode, 500);
    const approveResponse = await app.inject({
        method: "PATCH",
        url: `/time-off/requests/${created.id}`,
        headers: { authorization: "Bearer admin-token" },
        payload: { status: "approved" },
    });
    strict_1.default.equal(approveResponse.statusCode, 200);
    strict_1.default.equal(approveResponse.json().status, "approved");
    const moveResponse = await app.inject({
        method: "PATCH",
        url: `/me/time-off/${created.id}`,
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-05", note: "Moved date" },
    });
    strict_1.default.equal(moveResponse.statusCode, 200);
    strict_1.default.equal(moveResponse.json().date, "2026-03-05");
    strict_1.default.equal(moveResponse.json().status, "pending");
    const myTimeOffResponse = await app.inject({
        method: "GET",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(myTimeOffResponse.statusCode, 200);
    strict_1.default.equal(myTimeOffResponse.json().allowance.maxDays, 1);
    strict_1.default.equal(myTimeOffResponse.json().allowance.reservedDays, 1);
    strict_1.default.equal(myTimeOffResponse.json().allowance.remainingDays, 0);
    await app.close();
});
(0, node_test_1.default)("admin can issue a one-time access code and an employee can claim onboarding with an existing wallet", async () => {
    const { app } = createTestHarness();
    const createRecipientResponse = await app.inject({
        method: "POST",
        url: "/recipients",
        headers: { authorization: "Bearer admin-token" },
        payload: {
            walletAddress: null,
            name: "Ivy Turner",
            payType: "hourly",
            rate: 41,
            chainPreference: "Base",
            timeTrackingMode: "schedule_based",
            scheduleId: "s-1",
            employmentStartDate: "2026-02-15",
        },
    });
    strict_1.default.equal(createRecipientResponse.statusCode, 200);
    strict_1.default.equal(createRecipientResponse.json().onboardingStatus, "unclaimed");
    strict_1.default.equal(createRecipientResponse.json().walletAddress, null);
    const recipientId = createRecipientResponse.json().id;
    const inviteResponse = await app.inject({
        method: "POST",
        url: `/recipients/${recipientId}/access-code`,
        headers: { authorization: "Bearer admin-token" },
        payload: {},
    });
    strict_1.default.equal(inviteResponse.statusCode, 200);
    const code = inviteResponse.json().code;
    strict_1.default.ok(code.length >= 8);
    const redeemResponse = await app.inject({
        method: "POST",
        url: "/onboarding/redeem",
        payload: { code },
    });
    strict_1.default.equal(redeemResponse.statusCode, 200);
    strict_1.default.equal(redeemResponse.json().employee.name, "Ivy Turner");
    strict_1.default.equal(redeemResponse.json().options.existingWallet, true);
    const account = (0, accounts_1.privateKeyToAccount)("0x59c6995e998f97a5a0044966f09453827875d79eb8b7e51f5a61b0d12dd2c6d9");
    const challengeResponse = await app.inject({
        method: "POST",
        url: "/onboarding/wallet/challenge",
        payload: {
            code,
            address: account.address,
        },
    });
    strict_1.default.equal(challengeResponse.statusCode, 200);
    const challenge = challengeResponse.json();
    const signature = await account.signMessage({
        message: challenge.message,
    });
    const claimResponse = await app.inject({
        method: "POST",
        url: "/onboarding/wallet/claim",
        payload: {
            code,
            address: account.address,
            message: challenge.message,
            signature,
        },
    });
    strict_1.default.equal(claimResponse.statusCode, 200);
    strict_1.default.equal(claimResponse.json().role, "employee");
    strict_1.default.equal(claimResponse.json().employee.onboardingStatus, "claimed");
    strict_1.default.equal(claimResponse.json().employee.walletAddress.toLowerCase(), account.address.toLowerCase());
    const meResponse = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: `Bearer ${claimResponse.json().token}` },
    });
    strict_1.default.equal(meResponse.statusCode, 200);
    strict_1.default.equal(meResponse.json().employee.name, "Ivy Turner");
    const reuseResponse = await app.inject({
        method: "POST",
        url: "/onboarding/redeem",
        payload: { code },
    });
    strict_1.default.equal(reuseResponse.statusCode, 500);
    await app.close();
});
(0, node_test_1.default)("employee time-off requests reject past dates, non-working days, and duplicate active dates", async () => {
    const { app } = createTestHarness();
    const pastDateResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-02-27" },
    });
    strict_1.default.equal(pastDateResponse.statusCode, 500);
    strict_1.default.match(pastDateResponse.json().error, /today or future working days/i);
    const weekendResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-07" },
    });
    strict_1.default.equal(weekendResponse.statusCode, 500);
    strict_1.default.match(weekendResponse.json().error, /scheduled working day/i);
    const companyHolidayResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-05-25" },
    });
    strict_1.default.equal(companyHolidayResponse.statusCode, 500);
    strict_1.default.match(companyHolidayResponse.json().error, /company holiday/i);
    const createResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-03" },
    });
    strict_1.default.equal(createResponse.statusCode, 200);
    const created = createResponse.json();
    const duplicateCreateResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-03" },
    });
    strict_1.default.equal(duplicateCreateResponse.statusCode, 500);
    strict_1.default.match(duplicateCreateResponse.json().error, /already have a day-off request/i);
    const secondCreateResponse = await app.inject({
        method: "POST",
        url: "/me/time-off",
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-04" },
    });
    strict_1.default.equal(secondCreateResponse.statusCode, 200);
    const second = secondCreateResponse.json();
    const moveToDuplicateResponse = await app.inject({
        method: "PATCH",
        url: `/me/time-off/${second.id}`,
        headers: { authorization: "Bearer employee-token" },
        payload: { date: "2026-03-03" },
    });
    strict_1.default.equal(moveToDuplicateResponse.statusCode, 500);
    strict_1.default.match(moveToDuplicateResponse.json().error, /already have a day-off request/i);
    await app.close();
});
