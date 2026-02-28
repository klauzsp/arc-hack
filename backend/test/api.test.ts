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
  assert.ok(typeof approveResponse.json().onChainId === "string");

  const executeResponse = await app.inject({
    method: "POST",
    url: `/pay-runs/${createdPayRun.id}/execute`,
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(executeResponse.statusCode, 200);
  const executedPayRun = executeResponse.json() as { status: string; txHash?: string };
  assert.ok(["executed", "processing"].includes(executedPayRun.status));
  assert.ok(typeof executedPayRun.txHash === "string");

  if (executedPayRun.status === "processing") {
    const finalizeResponse = await app.inject({
      method: "POST",
      url: `/pay-runs/${createdPayRun.id}/finalize`,
      headers: { authorization: "Bearer admin-token" },
    });
    assert.equal(finalizeResponse.statusCode, 200);
    assert.equal(finalizeResponse.json().status, "executed");
  }

  await app.close();
});

test("admin can deactivate a recipient from the live recipient list", async () => {
  const { app, employee } = createTestHarness();

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/recipients/${employee.id}`,
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.json().ok, true);

  const recipientsResponse = await app.inject({
    method: "GET",
    url: "/recipients",
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(recipientsResponse.statusCode, 200);
  const recipients = recipientsResponse.json() as Array<{ id: string }>;
  assert.equal(recipients.some((recipient) => recipient.id === employee.id), false);

  const deletedEmployeeMe = await app.inject({
    method: "GET",
    url: "/me",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(deletedEmployeeMe.statusCode, 401);

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

test("employee can use custom clock times and withdraw earned wages from treasury", async () => {
  const { app, repository } = createTestHarness();
  const timeEmployee = repository.listEmployees().find((employee) => employee.timeTrackingMode === "check_in_out");
  assert.ok(timeEmployee);

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
  assert.equal(beforeEarnings.statusCode, 200);
  const beforeAvailable = beforeEarnings.json().availableToWithdraw as number;
  assert.ok(beforeAvailable > 0);

  const clockInResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-in",
    headers: { authorization: "Bearer time-employee-token" },
    payload: { date: "2026-02-28", clockIn: "10:15" },
  });
  assert.equal(clockInResponse.statusCode, 200);
  assert.equal(clockInResponse.json().clockIn, "10:15");

  const clockOutResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-out",
    headers: { authorization: "Bearer time-employee-token" },
    payload: { clockOut: "18:05" },
  });
  assert.equal(clockOutResponse.statusCode, 200);
  assert.equal(clockOutResponse.json().clockOut, "18:05");

  const withdrawResponse = await app.inject({
    method: "POST",
    url: "/me/withdraw",
    headers: { authorization: "Bearer time-employee-token" },
    payload: {},
  });
  assert.equal(withdrawResponse.statusCode, 200);
  assert.ok(withdrawResponse.json().amount > 0);
  assert.equal(typeof withdrawResponse.json().txHash, "string");

  const afterEarnings = await app.inject({
    method: "GET",
    url: "/me/earnings",
    headers: { authorization: "Bearer time-employee-token" },
  });
  assert.equal(afterEarnings.statusCode, 200);
  assert.ok(afterEarnings.json().availableToWithdraw < beforeAvailable);

  await app.close();
});
