import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

function createTestHarness() {
  const config = loadConfig({
    ...process.env,
    BACKEND_DB_PATH: ":memory:",
    BACKEND_SEED_DATE: "2026-02-28",
    BACKEND_JOBS_ENABLED: "false",
  });
  const harness = buildApp(config);
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

test("dashboard and treasury endpoints return seeded summary data", async () => {
  const { app } = createTestHarness();

  const dashboard = await app.inject({ method: "GET", url: "/dashboard" });
  assert.equal(dashboard.statusCode, 200);
  const dashboardBody = dashboard.json();
  assert.equal(dashboardBody.today, "2026-02-28");
  assert.ok(dashboardBody.totalUsdc > 0);

  const treasury = await app.inject({ method: "GET", url: "/treasury/balances" });
  assert.equal(treasury.statusCode, 200);
  const treasuryBody = treasury.json();
  assert.ok(Array.isArray(treasuryBody.chainBalances));
  assert.ok(treasuryBody.chainBalances.length >= 1);

  await app.close();
});

test("admin can create, approve, and execute a pay run", async () => {
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
  assert.equal(createResponse.statusCode, 200);
  const createdPayRun = createResponse.json();
  assert.equal(createdPayRun.status, "draft");

  const approveResponse = await app.inject({
    method: "POST",
    url: `/pay-runs/${createdPayRun.id}/approve`,
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(approveResponse.statusCode, 200);
  assert.equal(approveResponse.json().status, "approved");

  const executeResponse = await app.inject({
    method: "POST",
    url: `/pay-runs/${createdPayRun.id}/execute`,
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(executeResponse.statusCode, 200);
  const executedPayRun = executeResponse.json();
  assert.equal(executedPayRun.status, "executed");
  assert.ok(typeof executedPayRun.txHash === "string");

  await app.close();
});

test("employee earnings and time routes are scoped to the signed-in wallet", async () => {
  const { app } = createTestHarness();

  const earningsResponse = await app.inject({
    method: "GET",
    url: "/me/earnings",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(earningsResponse.statusCode, 200);
  const earnings = earningsResponse.json();
  assert.ok(earnings.currentPeriod.earned >= 0);
  assert.ok(earnings.availableToWithdraw >= 0);

  const scheduleResponse = await app.inject({
    method: "GET",
    url: "/me/schedule",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(scheduleResponse.statusCode, 200);
  assert.ok(scheduleResponse.json().workingDays.length >= 1);

  await app.close();
});
