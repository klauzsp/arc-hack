"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const app_1 = require("../src/app");
const config_1 = require("../src/config");
function createTestHarness() {
    const config = (0, config_1.loadConfig)({
        ...process.env,
        BACKEND_DB_PATH: ":memory:",
        BACKEND_SEED_DATE: "2026-02-28",
        BACKEND_JOBS_ENABLED: "false",
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
    strict_1.default.equal(executedPayRun.status, "executed");
    strict_1.default.ok(typeof executedPayRun.txHash === "string");
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
