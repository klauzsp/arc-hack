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
function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
async function withMockedFetch(handler, run) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
    try {
        await run();
    }
    finally {
        globalThis.fetch = originalFetch;
    }
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
(0, node_test_1.default)("admin can fully delete a recipient from the live recipient list", async () => {
    const { app, employee, repository } = createTestHarness();
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
    strict_1.default.equal(repository.getEmployee(employee.id), null);
    const deletedEmployeeMe = await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer employee-token" },
    });
    strict_1.default.equal(deletedEmployeeMe.statusCode, 401);
    await app.close();
});
(0, node_test_1.default)("deleting an invite recipient removes their access code and employee row", async () => {
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
    strict_1.default.equal(createRecipientResponse.statusCode, 200);
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
    strict_1.default.equal(repository.listEmployeeInviteCodes(recipientId).length, 1);
    const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/recipients/${recipientId}`,
        headers: { authorization: "Bearer admin-token" },
    });
    strict_1.default.equal(deleteResponse.statusCode, 200);
    strict_1.default.equal(deleteResponse.json().ok, true);
    strict_1.default.equal(repository.getEmployee(recipientId), null);
    strict_1.default.equal(repository.listEmployeeInviteCodes(recipientId).length, 0);
    const redeemResponse = await app.inject({
        method: "POST",
        url: "/onboarding/redeem",
        payload: { code },
    });
    strict_1.default.equal(redeemResponse.statusCode, 500);
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
(0, node_test_1.default)("employee time entries cannot overlap existing entries on the same day", async () => {
    const { app, repository } = createTestHarness();
    const timeEmployee = repository.listEmployees().find((employee) => employee.timeTrackingMode === "check_in_out");
    strict_1.default.ok(timeEmployee);
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
    strict_1.default.equal(overlappingClockInResponse.statusCode, 500);
    strict_1.default.match(overlappingClockInResponse.json().error, /overlaps an existing entry/i);
    const validClockInResponse = await app.inject({
        method: "POST",
        url: "/me/time-entries/clock-in",
        headers: { authorization: "Bearer time-overlap-token" },
        payload: { date: "2026-03-06", clockIn: "12:00" },
    });
    strict_1.default.equal(validClockInResponse.statusCode, 200);
    const overlappingClockOutResponse = await app.inject({
        method: "POST",
        url: "/me/time-entries/clock-out",
        headers: { authorization: "Bearer time-overlap-token" },
        payload: { clockOut: "15:00" },
    });
    strict_1.default.equal(overlappingClockOutResponse.statusCode, 500);
    strict_1.default.match(overlappingClockOutResponse.json().error, /overlaps an existing entry/i);
    const reverseClockOutResponse = await app.inject({
        method: "POST",
        url: "/me/time-entries/clock-out",
        headers: { authorization: "Bearer time-overlap-token" },
        payload: { clockOut: "11:45" },
    });
    strict_1.default.equal(reverseClockOutResponse.statusCode, 500);
    strict_1.default.match(reverseClockOutResponse.json().error, /later than clock-in time/i);
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
            scheduleId: "s-2",
            timeTrackingMode: "check_in_out",
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
            profile: {
                chainPreference: "Base",
            },
        },
    });
    strict_1.default.equal(claimResponse.statusCode, 200);
    strict_1.default.equal(claimResponse.json().role, "employee");
    strict_1.default.equal(claimResponse.json().employee.onboardingStatus, "claimed");
    strict_1.default.equal(claimResponse.json().employee.walletAddress.toLowerCase(), account.address.toLowerCase());
    strict_1.default.equal(claimResponse.json().employee.chainPreference, "Base");
    strict_1.default.equal(claimResponse.json().employee.scheduleId, "s-2");
    strict_1.default.equal(claimResponse.json().employee.timeTrackingMode, "check_in_out");
    strict_1.default.equal(claimResponse.json().employee.employmentStartDate, "2026-02-15");
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
(0, node_test_1.default)("invite-based employee onboarding can provision a Circle wallet through Google sign-in and use it for later login", async () => {
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
    strict_1.default.equal(createRecipientResponse.statusCode, 200);
    const recipientId = createRecipientResponse.json().id;
    const inviteResponse = await app.inject({
        method: "POST",
        url: `/recipients/${recipientId}/access-code`,
        headers: { authorization: "Bearer admin-token" },
        payload: {},
    });
    strict_1.default.equal(inviteResponse.statusCode, 200);
    const code = inviteResponse.json().code;
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
    strict_1.default.equal(startResponse.statusCode, 200);
    strict_1.default.equal(startResponse.json().circle.deviceToken, "device-token");
    strict_1.default.equal(startResponse.json().circle.deviceEncryptionKey, "device-encryption-key");
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
    strict_1.default.equal(prepareResponse.statusCode, 200);
    strict_1.default.equal(prepareResponse.json().circle.challengeId, "challenge-123");
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
    strict_1.default.equal(completeResponse.statusCode, 200);
    strict_1.default.equal(completeResponse.json().employee.walletAddress.toLowerCase(), circleWalletAddress.toLowerCase());
    strict_1.default.equal(completeResponse.json().employee.onboardingMethod, "circle");
    const googleDeviceTokenResponse = await app.inject({
        method: "POST",
        url: "/auth/circle/google/device-token",
        payload: {
            deviceId: "device-id-456",
        },
    });
    strict_1.default.equal(googleDeviceTokenResponse.statusCode, 200);
    strict_1.default.equal(googleDeviceTokenResponse.json().circle.appId, "circle-app-id");
    const verifyResponse = await app.inject({
        method: "POST",
        url: "/auth/circle/google/verify",
        payload: {
            userToken: "circle-user-token",
        },
    });
    strict_1.default.equal(verifyResponse.statusCode, 200);
    strict_1.default.equal(verifyResponse.json().role, "employee");
    strict_1.default.equal(verifyResponse.json().employee.walletAddress.toLowerCase(), circleWalletAddress.toLowerCase());
    await app.close();
});
(0, node_test_1.default)("editing a recipient chain preference also updates the stored destination domain", async () => {
    const { app, employee } = createTestHarness();
    const updateResponse = await app.inject({
        method: "PATCH",
        url: `/recipients/${employee.id}`,
        headers: { authorization: "Bearer admin-token" },
        payload: {
            chainPreference: "Base",
        },
    });
    strict_1.default.equal(updateResponse.statusCode, 200);
    strict_1.default.equal(updateResponse.json().chainPreference, "Base");
    strict_1.default.equal(updateResponse.json().destinationChainId, 6);
    await app.close();
});
(0, node_test_1.default)("editing a circle-onboarded recipient does not downgrade them to external-wallet login", async () => {
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
    strict_1.default.equal(updateResponse.statusCode, 200);
    strict_1.default.equal(updateResponse.json().onboardingMethod, "circle");
    strict_1.default.equal(updateResponse.json().chainPreference, "Base");
    strict_1.default.equal(updateResponse.json().destinationChainId, 6);
    const updatedEmployee = repository.getEmployee(employee.id);
    strict_1.default.equal(updatedEmployee?.onboardingMethod, "circle");
    strict_1.default.equal(updatedEmployee?.circleWalletId, "circle-wallet-1");
    strict_1.default.equal(updatedEmployee?.destinationChainId, 6);
    await app.close();
});
(0, node_test_1.default)("employee withdrawals route to the configured payout destination instead of always Arc", async () => {
    const { app, repository, services, employee } = createTestHarness();
    repository.updateEmployee(employee.id, {
        chainPreference: "Base",
        destinationChainId: 6,
        destinationWalletAddress: employee.walletAddress,
    });
    let capturedTransfer = null;
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
    strict_1.default.equal(withdrawResponse.statusCode, 200);
    strict_1.default.equal(withdrawResponse.json().chainPreference, "Base");
    strict_1.default.equal(withdrawResponse.json().destinationChainId, 6);
    strict_1.default.equal(withdrawResponse.json().status, "processing");
    strict_1.default.ok(capturedTransfer);
    const transfer = capturedTransfer;
    strict_1.default.equal(transfer.destinationChainId, 6);
    strict_1.default.equal(transfer.recipientWalletAddress, employee.walletAddress);
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
(0, node_test_1.default)("circle employee can prepare a Circle wallet transfer challenge", async () => {
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
            strict_1.default.equal(payload.walletId, "wallet-1");
            strict_1.default.equal(payload.destinationAddress, "0x00000000000000000000000000000000000000aa");
            strict_1.default.deepEqual(payload.amounts, ["1.25"]);
            strict_1.default.equal(payload.blockchain, "ARC-TESTNET");
            strict_1.default.equal(payload.tokenAddress, "0x3600000000000000000000000000000000000000");
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
        strict_1.default.equal(response.statusCode, 200);
        const body = response.json();
        strict_1.default.equal(body.kind, "same_chain_transfer");
        strict_1.default.equal(body.challengeId, "challenge-1");
        strict_1.default.equal(body.walletAddress, validWalletAddress);
        strict_1.default.equal(body.amount, 1.25);
        strict_1.default.equal(repository.getEmployee(employee.id)?.circleWalletId, "wallet-1");
    });
    await app.close();
});
(0, node_test_1.default)("circle employee gets an approval challenge before a cross-chain CCTP transfer", async () => {
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
    strict_1.default.equal(response.statusCode, 200);
    const body = response.json();
    strict_1.default.equal(body.kind, "cctp_approval");
    strict_1.default.equal(body.challengeId, "approve-challenge-1");
    strict_1.default.equal(body.destinationDomain, 6);
    strict_1.default.equal(body.transferSpeed, "standard");
    strict_1.default.equal(body.approvalTargetAddress.toLowerCase(), "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa");
    await app.close();
});
(0, node_test_1.default)("circle employee can prepare a CCTP transfer challenge once allowance exists", async () => {
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
    services.circleWalletService.getUsdcAllowance = async () => 9000000n;
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
    strict_1.default.equal(response.statusCode, 200);
    const body = response.json();
    strict_1.default.equal(body.kind, "cctp_transfer");
    strict_1.default.equal(body.challengeId, "cctp-challenge-1");
    strict_1.default.equal(body.destinationDomain, 6);
    strict_1.default.equal(body.transferSpeed, "standard");
    strict_1.default.equal(body.maxFee, 0);
    strict_1.default.equal(body.estimatedReceivedAmount, 3.5);
    await app.close();
});
(0, node_test_1.default)("circle wallet transfer rejects a mismatched Circle session", async () => {
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
        strict_1.default.equal(response.statusCode, 403);
        strict_1.default.match(response.json().error, /does not match/i);
    });
    await app.close();
});
