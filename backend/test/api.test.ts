import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { PayRunItemPreview } from "../src/domain/types";

function createTestHarness(overrides: Record<string, string> = {}) {
  const config = loadConfig({
    ...process.env,
    BACKEND_DB_PATH: ":memory:",
    BACKEND_SEED_DATE: "2026-02-28",
    BACKEND_JOBS_ENABLED: "false",
    ...overrides,
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedFetch(handler: typeof fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("admin can fully delete a recipient from the live recipient list", async () => {
  const { app, employee, repository } = createTestHarness();

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
  assert.equal(repository.getEmployee(employee.id), null);

  const deletedEmployeeMe = await app.inject({
    method: "GET",
    url: "/me",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(deletedEmployeeMe.statusCode, 401);

  await app.close();
});

test("deleting an invite recipient removes their access code and employee row", async () => {
  const { app, repository } = createTestHarness();

  const createRecipientResponse = await app.inject({
    method: "POST",
    url: "/recipients",
    headers: { authorization: "Bearer admin-token" },
    payload: {
      walletAddress: null,
      name: "Delete Invite",
      payType: "hourly",
      rate: 32,
      scheduleId: "s-2",
      timeTrackingMode: "check_in_out",
      employmentStartDate: "2026-02-15",
    },
  });
  assert.equal(createRecipientResponse.statusCode, 200);
  const recipientId = createRecipientResponse.json().id as string;

  const inviteResponse = await app.inject({
    method: "POST",
    url: `/recipients/${recipientId}/access-code`,
    headers: { authorization: "Bearer admin-token" },
    payload: {},
  });
  assert.equal(inviteResponse.statusCode, 200);
  const code = inviteResponse.json().code as string;
  assert.ok(code.length >= 8);
  assert.equal(repository.listEmployeeInviteCodes(recipientId).length, 1);

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/recipients/${recipientId}`,
    headers: { authorization: "Bearer admin-token" },
  });
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.json().ok, true);

  assert.equal(repository.getEmployee(recipientId), null);
  assert.equal(repository.listEmployeeInviteCodes(recipientId).length, 0);

  const redeemResponse = await app.inject({
    method: "POST",
    url: "/onboarding/redeem",
    payload: { code },
  });
  assert.equal(redeemResponse.statusCode, 500);

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

test("employee time entries cannot overlap existing entries on the same day", async () => {
  const { app, repository } = createTestHarness();
  const timeEmployee = repository.listEmployees().find((employee) => employee.timeTrackingMode === "check_in_out");
  assert.ok(timeEmployee);

  repository.createSession({
    token: "time-overlap-token",
    address: timeEmployee.walletAddress,
    role: "employee",
    employeeId: timeEmployee.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  repository.createTimeEntry({
    id: "existing-overlap-entry",
    employeeId: timeEmployee.id,
    date: "2026-03-06",
    clockIn: "14:00",
    clockOut: "18:00",
    createdAt: "2026-03-06T14:00:00.000Z",
  });

  const overlappingClockInResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-in",
    headers: { authorization: "Bearer time-overlap-token" },
    payload: { date: "2026-03-06", clockIn: "15:30" },
  });
  assert.equal(overlappingClockInResponse.statusCode, 500);
  assert.match(overlappingClockInResponse.json().error, /overlaps an existing entry/i);

  const validClockInResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-in",
    headers: { authorization: "Bearer time-overlap-token" },
    payload: { date: "2026-03-06", clockIn: "12:00" },
  });
  assert.equal(validClockInResponse.statusCode, 200);

  const overlappingClockOutResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-out",
    headers: { authorization: "Bearer time-overlap-token" },
    payload: { clockOut: "15:00" },
  });
  assert.equal(overlappingClockOutResponse.statusCode, 500);
  assert.match(overlappingClockOutResponse.json().error, /overlaps an existing entry/i);

  const reverseClockOutResponse = await app.inject({
    method: "POST",
    url: "/me/time-entries/clock-out",
    headers: { authorization: "Bearer time-overlap-token" },
    payload: { clockOut: "11:45" },
  });
  assert.equal(reverseClockOutResponse.statusCode, 500);
  assert.match(reverseClockOutResponse.json().error, /later than clock-in time/i);

  await app.close();
});

test("schedule-based earnings accrue linearly during the workday", async () => {
  const { app } = createTestHarness({
    BACKEND_SEED_DATE: "2026-02-27",
    BACKEND_REFERENCE_NOW: "2026-02-27T18:00:00.000Z",
  });

  const earningsResponse = await app.inject({
    method: "GET",
    url: "/me/earnings",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(earningsResponse.statusCode, 200);
  const earnings = earningsResponse.json();
  assert.ok(earnings.breakdown.currentPeriodDays % 1 !== 0);
  assert.ok(earnings.currentPeriod.earned > 0);

  await app.close();
});

test("employee day-off requests honor the annual limit and can be moved without adding extra days", async () => {
  const { app } = createTestHarness();

  const policyResponse = await app.inject({
    method: "PATCH",
    url: "/time-off/policy",
    headers: { authorization: "Bearer admin-token" },
    payload: { maxDaysPerYear: 1 },
  });
  assert.equal(policyResponse.statusCode, 200);
  assert.equal(policyResponse.json().maxDaysPerYear, 1);

  const createResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-03", note: "Family event" },
  });
  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json() as { id: string; status: string; date: string };
  assert.equal(created.status, "pending");

  const secondCreateResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-04" },
  });
  assert.equal(secondCreateResponse.statusCode, 500);

  const approveResponse = await app.inject({
    method: "PATCH",
    url: `/time-off/requests/${created.id}`,
    headers: { authorization: "Bearer admin-token" },
    payload: { status: "approved" },
  });
  assert.equal(approveResponse.statusCode, 200);
  assert.equal(approveResponse.json().status, "approved");

  const moveResponse = await app.inject({
    method: "PATCH",
    url: `/me/time-off/${created.id}`,
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-05", note: "Moved date" },
  });
  assert.equal(moveResponse.statusCode, 200);
  assert.equal(moveResponse.json().date, "2026-03-05");
  assert.equal(moveResponse.json().status, "pending");

  const myTimeOffResponse = await app.inject({
    method: "GET",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
  });
  assert.equal(myTimeOffResponse.statusCode, 200);
  assert.equal(myTimeOffResponse.json().allowance.maxDays, 1);
  assert.equal(myTimeOffResponse.json().allowance.reservedDays, 1);
  assert.equal(myTimeOffResponse.json().allowance.remainingDays, 0);

  await app.close();
});

test("admin can issue a one-time access code and an employee can claim onboarding with an existing wallet", async () => {
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
      scheduleId: "s-2",
      timeTrackingMode: "check_in_out",
      employmentStartDate: "2026-02-15",
    },
  });
  assert.equal(createRecipientResponse.statusCode, 200);
  assert.equal(createRecipientResponse.json().onboardingStatus, "unclaimed");
  assert.equal(createRecipientResponse.json().walletAddress, null);

  const recipientId = createRecipientResponse.json().id as string;
  const inviteResponse = await app.inject({
    method: "POST",
    url: `/recipients/${recipientId}/access-code`,
    headers: { authorization: "Bearer admin-token" },
    payload: {},
  });
  assert.equal(inviteResponse.statusCode, 200);
  const code = inviteResponse.json().code as string;
  assert.ok(code.length >= 8);

  const redeemResponse = await app.inject({
    method: "POST",
    url: "/onboarding/redeem",
    payload: { code },
  });
  assert.equal(redeemResponse.statusCode, 200);
  assert.equal(redeemResponse.json().employee.name, "Ivy Turner");
  assert.equal(redeemResponse.json().options.existingWallet, true);

  const account = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f09453827875d79eb8b7e51f5a61b0d12dd2c6d9",
  );

  const challengeResponse = await app.inject({
    method: "POST",
    url: "/onboarding/wallet/challenge",
    payload: {
      code,
      address: account.address,
    },
  });
  assert.equal(challengeResponse.statusCode, 200);
  const challenge = challengeResponse.json() as { message: string };

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
      profile: {
        chainPreference: "Base",
      },
    },
  });
  assert.equal(claimResponse.statusCode, 200);
  assert.equal(claimResponse.json().role, "employee");
  assert.equal(claimResponse.json().employee.onboardingStatus, "claimed");
  assert.equal(claimResponse.json().employee.walletAddress.toLowerCase(), account.address.toLowerCase());
  assert.equal(claimResponse.json().employee.chainPreference, "Base");
  assert.equal(claimResponse.json().employee.scheduleId, "s-2");
  assert.equal(claimResponse.json().employee.timeTrackingMode, "check_in_out");
  assert.equal(claimResponse.json().employee.employmentStartDate, "2026-02-15");

  const meResponse = await app.inject({
    method: "GET",
    url: "/me",
    headers: { authorization: `Bearer ${claimResponse.json().token as string}` },
  });
  assert.equal(meResponse.statusCode, 200);
  assert.equal(meResponse.json().employee.name, "Ivy Turner");

  const reuseResponse = await app.inject({
    method: "POST",
    url: "/onboarding/redeem",
    payload: { code },
  });
  assert.equal(reuseResponse.statusCode, 500);

  await app.close();
});

test("invite-based employee onboarding can provision a Circle wallet through Google sign-in and use it for later login", async () => {
  const { app, services } = createTestHarness({
    CIRCLE_API_KEY: "circle-api-key",
    CIRCLE_APP_ID: "circle-app-id",
  });

  const circleWalletAddress = "0x1000000000000000000000000000000000000001";
  services.circleWalletService.createSocialDeviceToken = async () => ({
    appId: "circle-app-id",
    deviceToken: "device-token",
    deviceEncryptionKey: "device-encryption-key",
  });
  services.circleWalletService.startArcWalletProvisioning = async () => ({
    challengeId: "challenge-123",
    wallet: null,
  });
  services.circleWalletService.getArcWallet = async () => ({
    id: "wallet-123",
    address: circleWalletAddress,
    blockchain: "ARC-TESTNET",
    state: "LIVE",
  });

  const createRecipientResponse = await app.inject({
    method: "POST",
    url: "/recipients",
    headers: { authorization: "Bearer admin-token" },
    payload: {
      walletAddress: null,
      name: "Kai Rivera",
      payType: "daily",
      rate: 400,
      scheduleId: "s-1",
      timeTrackingMode: "schedule_based",
      employmentStartDate: "2026-02-01",
    },
  });
  assert.equal(createRecipientResponse.statusCode, 200);
  const recipientId = createRecipientResponse.json().id as string;

  const inviteResponse = await app.inject({
    method: "POST",
    url: `/recipients/${recipientId}/access-code`,
    headers: { authorization: "Bearer admin-token" },
    payload: {},
  });
  assert.equal(inviteResponse.statusCode, 200);
  const code = inviteResponse.json().code as string;

  const startResponse = await app.inject({
    method: "POST",
    url: "/onboarding/circle/start",
    payload: {
      code,
      deviceId: "device-id-123",
      profile: {
        chainPreference: "Arc",
      },
    },
  });
  assert.equal(startResponse.statusCode, 200);
  assert.equal(startResponse.json().circle.deviceToken, "device-token");
  assert.equal(startResponse.json().circle.deviceEncryptionKey, "device-encryption-key");

  const prepareResponse = await app.inject({
    method: "POST",
    url: "/onboarding/circle/prepare",
    payload: {
      code,
      userToken: "circle-user-token",
      profile: {
        chainPreference: "Arc",
      },
    },
  });
  assert.equal(prepareResponse.statusCode, 200);
  assert.equal(prepareResponse.json().circle.challengeId, "challenge-123");

  const completeResponse = await app.inject({
    method: "POST",
    url: "/onboarding/circle/complete",
    payload: {
      code,
      userToken: "circle-user-token",
      profile: {
        chainPreference: "Arc",
      },
    },
  });
  assert.equal(completeResponse.statusCode, 200);
  assert.equal(completeResponse.json().employee.walletAddress.toLowerCase(), circleWalletAddress.toLowerCase());
  assert.equal(completeResponse.json().employee.onboardingMethod, "circle");

  const googleDeviceTokenResponse = await app.inject({
    method: "POST",
    url: "/auth/circle/google/device-token",
    payload: {
      deviceId: "device-id-456",
    },
  });
  assert.equal(googleDeviceTokenResponse.statusCode, 200);
  assert.equal(googleDeviceTokenResponse.json().circle.appId, "circle-app-id");

  const verifyResponse = await app.inject({
    method: "POST",
    url: "/auth/circle/google/verify",
    payload: {
      userToken: "circle-user-token",
    },
  });
  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyResponse.json().role, "employee");
  assert.equal(verifyResponse.json().employee.walletAddress.toLowerCase(), circleWalletAddress.toLowerCase());

  await app.close();
});

test("editing a recipient chain preference also updates the stored destination domain", async () => {
  const { app, employee } = createTestHarness();

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/recipients/${employee.id}`,
    headers: { authorization: "Bearer admin-token" },
    payload: {
      chainPreference: "Base",
    },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().chainPreference, "Base");
  assert.equal(updateResponse.json().destinationChainId, 6);

  await app.close();
});

test("editing a circle-onboarded recipient does not downgrade them to external-wallet login", async () => {
  const { app, repository, employee } = createTestHarness();
  const circleWalletAddress = "0x1000000000000000000000000000000000000001";
  repository.updateEmployee(employee.id, {
    walletAddress: circleWalletAddress,
    destinationWalletAddress: circleWalletAddress,
    onboardingStatus: "claimed",
    onboardingMethod: "circle",
    circleWalletId: "circle-wallet-1",
  });

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/recipients/${employee.id}`,
    headers: { authorization: "Bearer admin-token" },
    payload: {
      walletAddress: circleWalletAddress,
      chainPreference: "Base",
    },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().onboardingMethod, "circle");
  assert.equal(updateResponse.json().chainPreference, "Base");
  assert.equal(updateResponse.json().destinationChainId, 6);

  const updatedEmployee = repository.getEmployee(employee.id);
  assert.equal(updatedEmployee?.onboardingMethod, "circle");
  assert.equal(updatedEmployee?.circleWalletId, "circle-wallet-1");
  assert.equal(updatedEmployee?.destinationChainId, 6);

  await app.close();
});

test("employee withdrawals route to the configured payout destination instead of always Arc", async () => {
  const { app, repository, services, employee } = createTestHarness();
  repository.updateEmployee(employee.id, {
    chainPreference: "Base",
    destinationChainId: 6,
    destinationWalletAddress: employee.walletAddress,
  });

  let capturedTransfer: PayRunItemPreview | null = null;

  services.chainService.transferPayroll = async (item) => {
    capturedTransfer = item;
    return {
      txHash: "0xwithdrawbase000000000000000000000000000000000000000000000000000000",
      status: "processing",
    };
  };

  const withdrawResponse = await app.inject({
    method: "POST",
    url: "/me/withdraw",
    headers: { authorization: "Bearer employee-token" },
    payload: {},
  });
  assert.equal(withdrawResponse.statusCode, 200);
  assert.equal(withdrawResponse.json().chainPreference, "Base");
  assert.equal(withdrawResponse.json().destinationChainId, 6);
  assert.equal(withdrawResponse.json().status, "processing");
  assert.ok(capturedTransfer);
  const transfer = capturedTransfer as PayRunItemPreview;
  assert.equal(transfer.destinationChainId, 6);
  assert.equal(transfer.recipientWalletAddress, employee.walletAddress);

  await app.close();
});

test("employee time-off requests reject past dates, non-working days, and duplicate active dates", async () => {
  const { app } = createTestHarness();

  const pastDateResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-02-27" },
  });
  assert.equal(pastDateResponse.statusCode, 500);
  assert.match(pastDateResponse.json().error as string, /today or future working days/i);

  const weekendResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-07" },
  });
  assert.equal(weekendResponse.statusCode, 500);
  assert.match(weekendResponse.json().error as string, /scheduled working day/i);

  const companyHolidayResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-05-25" },
  });
  assert.equal(companyHolidayResponse.statusCode, 500);
  assert.match(companyHolidayResponse.json().error as string, /company holiday/i);

  const createResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-03" },
  });
  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json() as { id: string };

  const duplicateCreateResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-03" },
  });
  assert.equal(duplicateCreateResponse.statusCode, 500);
  assert.match(duplicateCreateResponse.json().error as string, /already have a day-off request/i);

  const secondCreateResponse = await app.inject({
    method: "POST",
    url: "/me/time-off",
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-04" },
  });
  assert.equal(secondCreateResponse.statusCode, 200);
  const second = secondCreateResponse.json() as { id: string };

  const moveToDuplicateResponse = await app.inject({
    method: "PATCH",
    url: `/me/time-off/${second.id}`,
    headers: { authorization: "Bearer employee-token" },
    payload: { date: "2026-03-03" },
  });
  assert.equal(moveToDuplicateResponse.statusCode, 500);
  assert.match(moveToDuplicateResponse.json().error as string, /already have a day-off request/i);

  await app.close();
});

test("circle employee can prepare a Circle wallet transfer challenge", async () => {
  const { app, employee, repository } = createTestHarness({
    CIRCLE_API_KEY: "TEST_API_KEY:test-key:test-secret",
    CIRCLE_APP_ID: "circle-app-id",
  });
  const validWalletAddress = "0x0000000000000000000000000000000000000001";
  repository.updateEmployee(employee.id, {
    walletAddress: validWalletAddress,
    destinationWalletAddress: validWalletAddress,
    onboardingMethod: "circle",
    circleWalletId: null,
  });
  repository.createSession({
    token: "circle-employee-token",
    address: validWalletAddress,
    role: "employee",
    employeeId: employee.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  await withMockedFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/w3s/wallets") && (init?.method ?? "GET") === "GET") {
      return jsonResponse({
        data: {
          wallets: [
            {
              id: "wallet-1",
              address: validWalletAddress,
              blockchain: "ARC-TESTNET",
            },
          ],
        },
      });
    }
    if (url.endsWith("/v1/w3s/user/transactions/transfer") && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.walletId, "wallet-1");
      assert.equal(payload.destinationAddress, "0x00000000000000000000000000000000000000aa");
      assert.deepEqual(payload.amounts, ["1.25"]);
      assert.equal(payload.blockchain, "ARC-TESTNET");
      assert.equal(payload.tokenAddress, "0x3600000000000000000000000000000000000000");
      return jsonResponse({
        data: {
          challengeId: "challenge-1",
        },
      });
    }
    throw new Error(`Unexpected Circle fetch: ${url}`);
  }, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/me/circle/wallet/transfer",
      headers: { authorization: "Bearer circle-employee-token" },
      payload: {
        userToken: "circle-user-token",
        destinationAddress: "0x00000000000000000000000000000000000000aa",
        amount: "1.250000",
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.kind, "same_chain_transfer");
    assert.equal(body.challengeId, "challenge-1");
    assert.equal(body.walletAddress, validWalletAddress);
    assert.equal(body.amount, 1.25);
    assert.equal(repository.getEmployee(employee.id)?.circleWalletId, "wallet-1");
  });

  await app.close();
});

test("circle employee gets an approval challenge before a cross-chain CCTP transfer", async () => {
  const { app, repository, employee, services } = createTestHarness({
    CIRCLE_API_KEY: "TEST_API_KEY:test-key:test-secret",
    CIRCLE_APP_ID: "circle-app-id",
  });
  const validWalletAddress = "0x0000000000000000000000000000000000000001";
  repository.updateEmployee(employee.id, {
    walletAddress: validWalletAddress,
    destinationWalletAddress: validWalletAddress,
    onboardingMethod: "circle",
    circleWalletId: null,
  });
  repository.createSession({
    token: "circle-employee-token",
    address: validWalletAddress,
    role: "employee",
    employeeId: employee.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  services.circleWalletService.getArcWallet = async () => ({
    id: "wallet-1",
    address: validWalletAddress,
    blockchain: "ARC-TESTNET",
  });
  services.circleWalletService.getUsdcAllowance = async () => 0n;
  services.circleWalletService.createContractExecutionChallenge = async () => ({
    challengeId: "approve-challenge-1",
  });

  const response = await app.inject({
    method: "POST",
    url: "/me/circle/wallet/transfer",
    headers: { authorization: "Bearer circle-employee-token" },
    payload: {
      userToken: "circle-user-token",
      destinationAddress: "0x00000000000000000000000000000000000000aa",
      destinationPreference: "Base",
      amount: "3.5",
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.kind, "cctp_approval");
  assert.equal(body.challengeId, "approve-challenge-1");
  assert.equal(body.destinationDomain, 6);
  assert.equal(body.transferSpeed, "standard");
  assert.equal(body.approvalTargetAddress.toLowerCase(), "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa");

  await app.close();
});

test("circle employee can prepare a CCTP transfer challenge once allowance exists", async () => {
  const { app, repository, employee, services } = createTestHarness({
    CIRCLE_API_KEY: "TEST_API_KEY:test-key:test-secret",
    CIRCLE_APP_ID: "circle-app-id",
  });
  const validWalletAddress = "0x0000000000000000000000000000000000000001";
  repository.updateEmployee(employee.id, {
    walletAddress: validWalletAddress,
    destinationWalletAddress: validWalletAddress,
    onboardingMethod: "circle",
    circleWalletId: null,
  });
  repository.createSession({
    token: "circle-employee-token",
    address: validWalletAddress,
    role: "employee",
    employeeId: employee.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  services.circleWalletService.getArcWallet = async () => ({
    id: "wallet-1",
    address: validWalletAddress,
    blockchain: "ARC-TESTNET",
  });
  services.circleWalletService.getUsdcAllowance = async () => 9_000_000n;
  services.circleWalletService.createContractExecutionChallenge = async () => ({
    challengeId: "cctp-challenge-1",
  });

  const response = await app.inject({
    method: "POST",
    url: "/me/circle/wallet/transfer",
    headers: { authorization: "Bearer circle-employee-token" },
    payload: {
      userToken: "circle-user-token",
      destinationAddress: "0x00000000000000000000000000000000000000aa",
      destinationPreference: "Base",
      amount: "3.5",
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.kind, "cctp_transfer");
  assert.equal(body.challengeId, "cctp-challenge-1");
  assert.equal(body.destinationDomain, 6);
  assert.equal(body.transferSpeed, "standard");
  assert.equal(body.maxFee, 0);
  assert.equal(body.estimatedReceivedAmount, 3.5);

  await app.close();
});

test("circle wallet transfer rejects a mismatched Circle session", async () => {
  const { app, repository, employee } = createTestHarness({
    CIRCLE_API_KEY: "TEST_API_KEY:test-key:test-secret",
    CIRCLE_APP_ID: "circle-app-id",
  });
  const validWalletAddress = "0x0000000000000000000000000000000000000001";
  repository.updateEmployee(employee.id, {
    walletAddress: validWalletAddress,
    destinationWalletAddress: validWalletAddress,
    onboardingMethod: "circle",
  });
  repository.createSession({
    token: "circle-employee-token",
    address: validWalletAddress,
    role: "employee",
    employeeId: employee.id,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  await withMockedFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/w3s/wallets") && (init?.method ?? "GET") === "GET") {
      return jsonResponse({
        data: {
          wallets: [
            {
              id: "wallet-2",
              address: "0x00000000000000000000000000000000000000bb",
              blockchain: "ARC-TESTNET",
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected Circle fetch: ${url}`);
  }, async () => {
    const response = await app.inject({
      method: "POST",
      url: "/me/circle/wallet/transfer",
      headers: { authorization: "Bearer circle-employee-token" },
      payload: {
        userToken: "circle-user-token",
        destinationAddress: "0x00000000000000000000000000000000000000aa",
        amount: "2",
      },
    });

    assert.equal(response.statusCode, 403);
    assert.match(response.json().error as string, /does not match/i);
  });

  await app.close();
});
