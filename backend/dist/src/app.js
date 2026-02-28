"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const zod_1 = require("zod");
const viem_1 = require("viem");
const cctp_1 = require("./lib/cctp");
const repository_1 = require("./repository");
const authService_1 = require("./services/authService");
const chainService_1 = require("./services/chainService");
const circleWalletService_1 = require("./services/circleWalletService");
const jobService_1 = require("./services/jobService");
const payrollService_1 = require("./services/payrollService");
const dates_1 = require("./lib/dates");
class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
const recipientSchema = zod_1.z.object({
    walletAddress: zod_1.z.string().min(1).nullable().optional(),
    name: zod_1.z.string().min(1),
    payType: zod_1.z.enum(["yearly", "daily", "hourly"]),
    rate: zod_1.z.number().nonnegative(),
    chainPreference: zod_1.z.string().nullable().optional(),
    destinationChainId: zod_1.z.number().nullable().optional(),
    destinationWalletAddress: zod_1.z.string().nullable().optional(),
    scheduleId: zod_1.z.string().nullable().optional(),
    timeTrackingMode: zod_1.z.enum(["check_in_out", "schedule_based"]).optional(),
    employmentStartDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    active: zod_1.z.boolean().optional(),
});
const scheduleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    timezone: zod_1.z.string().min(1),
    startTime: zod_1.z.string().regex(/^\d{2}:\d{2}$/),
    hoursPerDay: zod_1.z.number().positive(),
    workingDays: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).min(1),
});
const holidaySchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: zod_1.z.string().min(1),
});
const policySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.enum(["payday", "treasury_threshold", "manual"]),
    status: zod_1.z.enum(["active", "paused"]).optional(),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    lastRunAt: zod_1.z.string().nullable().optional(),
});
const payRunSchema = zod_1.z.object({
    periodStart: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    employeeIds: zod_1.z.array(zod_1.z.string()).optional(),
});
const rebalanceSchema = zod_1.z.object({
    direction: zod_1.z.enum(["usdc_to_usyc", "usyc_to_usdc"]),
    amount: zod_1.z.number().positive(),
});
const autoPolicySchema = zod_1.z.object({
    autoRebalanceEnabled: zod_1.z.boolean().optional(),
    autoRedeemEnabled: zod_1.z.boolean().optional(),
    rebalanceThreshold: zod_1.z.number().nonnegative().optional(),
    payoutNoticeHours: zod_1.z.number().int().positive().optional(),
});
const clockInSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    clockIn: zod_1.z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
const clockOutSchema = zod_1.z.object({
    clockOut: zod_1.z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
const withdrawSchema = zod_1.z.object({
    amount: zod_1.z.number().positive().optional(),
});
const timeOffPolicySchema = zod_1.z.object({
    maxDaysPerYear: zod_1.z.number().int().positive(),
});
const employeeTimeOffSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: zod_1.z.string().max(500).nullable().optional(),
});
const employeeTimeOffUpdateSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: zod_1.z.string().max(500).nullable().optional(),
    status: zod_1.z.enum(["cancelled"]).optional(),
});
const adminTimeOffReviewSchema = zod_1.z.object({
    status: zod_1.z.enum(["approved", "rejected", "cancelled"]),
});
const onboardingCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(6),
});
const circleGoogleDeviceTokenSchema = zod_1.z.object({
    deviceId: zod_1.z.string().min(1),
});
const circleGoogleVerifySchema = zod_1.z.object({
    userToken: zod_1.z.string().min(1),
});
const onboardingWalletChallengeSchema = onboardingCodeSchema.extend({
    address: zod_1.z.string().min(1),
});
const onboardingProfileSchema = zod_1.z.object({
    chainPreference: zod_1.z.string().min(1).nullable().optional(),
});
const onboardingWalletClaimSchema = onboardingCodeSchema.extend({
    address: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
    signature: zod_1.z.string().startsWith("0x"),
    profile: onboardingProfileSchema.optional(),
});
const onboardingCircleStartSchema = onboardingCodeSchema.extend({
    deviceId: zod_1.z.string().min(1),
    profile: onboardingProfileSchema.optional(),
});
const onboardingCirclePrepareSchema = onboardingCodeSchema.extend({
    userToken: zod_1.z.string().min(1),
    profile: onboardingProfileSchema.optional(),
});
const onboardingCircleCompleteSchema = onboardingCodeSchema.extend({
    userToken: zod_1.z.string().min(1),
    profile: onboardingProfileSchema.optional(),
});
const circleWalletSessionSchema = zod_1.z.object({
    userToken: zod_1.z.string().min(1),
});
const circleWalletTransferSchema = circleWalletSessionSchema.extend({
    destinationAddress: zod_1.z.string().min(1),
    amount: zod_1.z.string().min(1),
    destinationPreference: zod_1.z.string().min(1).optional(),
});
const erc20ApproveAbi = (0, viem_1.parseAbi)([
    "function approve(address spender, uint256 amount) returns (bool)",
]);
const tokenMessengerAbi = (0, viem_1.parseAbi)([
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
    "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);
async function getSessionOrThrow(request, authService, requiredRole) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
        throw new HttpError(401, "Missing bearer token.");
    }
    const token = authorization.slice("Bearer ".length).trim();
    const session = authService.getSession(token, (0, dates_1.nowIso)());
    if (!session)
        throw new HttpError(401, "Session expired or invalid.");
    if (requiredRole && session.role !== requiredRole)
        throw new HttpError(403, "Insufficient permissions.");
    return session;
}
function normalizeUsdcAmount(value) {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(trimmed)) {
        throw new HttpError(400, "Amount must be a positive USDC value with up to 6 decimals.");
    }
    const [whole, fractional = ""] = trimmed.split(".");
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
    const normalizedFractional = fractional.replace(/0+$/, "");
    const normalized = normalizedFractional ? `${normalizedWhole}.${normalizedFractional}` : normalizedWhole;
    if (Number(normalized) <= 0) {
        throw new HttpError(400, "Amount must be greater than zero.");
    }
    return normalized;
}
function bytes32FromAddress(address) {
    return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}
function usdcBaseUnitsToNumber(value) {
    return Number(value) / 1_000_000;
}
function buildApp(config) {
    const repository = new repository_1.PayrollRepository(config.dbPath);
    repository.initialize({
        companyId: config.companyId,
        companyName: config.companyName,
        today: config.seedDate,
        arcChainId: config.arcChainId,
    });
    const chainService = new chainService_1.ChainService(config);
    const payrollService = new payrollService_1.PayrollService(repository, config, chainService);
    const circleWalletService = new circleWalletService_1.CircleWalletService(config);
    const authService = new authService_1.AuthService(repository, config, circleWalletService);
    const jobService = new jobService_1.JobService(payrollService);
    const app = (0, fastify_1.default)({ logger: false });
    void app.register(cors_1.default, {
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            callback(null, config.corsOrigins.includes(origin));
        },
        credentials: true,
        methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    });
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof HttpError) {
            reply.status(error.statusCode).send({ error: error.message });
            return;
        }
        if (error instanceof zod_1.ZodError) {
            reply.status(400).send({
                error: "Validation error",
                issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                })),
            });
            return;
        }
        if (error instanceof Error) {
            reply.status(500).send({ error: error.message || "Internal server error" });
            return;
        }
        reply.status(500).send({ error: "Internal server error" });
    });
    app.get("/health", async () => ({
        ok: true,
        mode: config.chainMode,
        stableFxConfigured: Boolean(config.liveChain?.stableFxApiKey),
        circleConfigured: circleWalletService.isConfigured(),
    }));
    app.post("/auth/challenge", async (request) => {
        const body = zod_1.z.object({ address: zod_1.z.string().min(1) }).parse(request.body ?? {});
        return authService.issueChallenge(body.address, (0, dates_1.nowIso)());
    });
    app.post("/auth/verify", async (request) => {
        const body = zod_1.z.object({
            address: zod_1.z.string().min(1),
            message: zod_1.z.string().min(1),
            signature: zod_1.z.string().startsWith("0x"),
        }).parse(request.body ?? {});
        return authService.verifyChallenge({
            address: body.address,
            message: body.message,
            signature: body.signature,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.post("/auth/circle/google/device-token", async (request) => {
        const body = circleGoogleDeviceTokenSchema.parse(request.body ?? {});
        return authService.issueCircleGoogleDeviceToken(body.deviceId);
    });
    app.post("/auth/circle/google/verify", async (request) => {
        const body = circleGoogleVerifySchema.parse(request.body ?? {});
        return authService.verifyCircleEmployeeLogin({
            userToken: body.userToken,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.get("/me", async (request) => {
        const session = await getSessionOrThrow(request, authService);
        return payrollService.getProfile(session.address);
    });
    app.post("/me/circle/wallet/transfer", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        const body = circleWalletTransferSchema.parse(request.body ?? {});
        if (!circleWalletService.isConfigured()) {
            throw new HttpError(500, "Circle user-controlled wallets are not configured.");
        }
        const employee = repository.getEmployeeByWallet(session.address);
        if (!employee || !employee.active) {
            throw new HttpError(404, "Active employee not found for this session.");
        }
        if (employee.onboardingMethod !== "circle") {
            throw new HttpError(400, "This employee does not use a Circle wallet.");
        }
        if (!(0, viem_1.isAddress)(body.destinationAddress)) {
            throw new HttpError(400, "Destination wallet address is invalid.");
        }
        if (body.destinationAddress.toLowerCase() === session.address.toLowerCase()) {
            throw new HttpError(400, "Destination wallet must be different from your payroll wallet.");
        }
        const wallet = await circleWalletService.getArcWallet(body.userToken);
        const walletAddress = wallet?.address?.toLowerCase();
        if (!wallet?.id || !walletAddress || !(0, viem_1.isAddress)(walletAddress)) {
            throw new HttpError(400, "No Arc Circle wallet is available for this user.");
        }
        if (walletAddress !== session.address.toLowerCase()) {
            throw new HttpError(403, "This Circle session does not match the signed-in payroll employee.");
        }
        if (wallet.id !== employee.circleWalletId) {
            repository.updateEmployee(employee.id, { circleWalletId: wallet.id });
        }
        const normalizedAmount = normalizeUsdcAmount(body.amount);
        const normalizedDestinationAddress = body.destinationAddress.toLowerCase();
        const destinationRoute = (0, cctp_1.getCctpRouteByPreference)(body.destinationPreference ?? "Arc");
        const amountBaseUnits = (0, viem_1.parseUnits)(normalizedAmount, 6);
        if (destinationRoute.domain === cctp_1.ARC_TESTNET_CCTP_DOMAIN) {
            const transfer = await circleWalletService.createTransferChallenge({
                userToken: body.userToken,
                walletId: wallet.id,
                destinationAddress: normalizedDestinationAddress,
                amount: normalizedAmount,
                refId: `arc-payroll-transfer-${employee.id}-${Date.now()}`,
            });
            return {
                kind: "same_chain_transfer",
                walletAddress,
                walletId: wallet.id,
                challengeId: transfer.challengeId,
                blockchain: transfer.blockchain,
                tokenAddress: transfer.tokenAddress,
                symbol: transfer.symbol,
                sourceChain: "Arc Testnet",
                destinationChain: destinationRoute.displayName,
                destinationDomain: destinationRoute.domain,
                destinationAddress: normalizedDestinationAddress,
                approvalTargetAddress: null,
                amount: Number(normalizedAmount),
                estimatedReceivedAmount: Number(normalizedAmount),
                maxFee: 0,
                transferSpeed: "instant",
            };
        }
        const sourceRoute = (0, cctp_1.getCctpRouteByPreference)("Arc");
        const finalityThreshold = sourceRoute.fastSourceSupported
            ? cctp_1.CCTP_FAST_FINALITY_THRESHOLD
            : cctp_1.CCTP_SLOW_FINALITY_THRESHOLD;
        const transferSpeed = sourceRoute.fastSourceSupported ? "fast" : "standard";
        const useForwarder = destinationRoute.forwarderSupported;
        const approvalTargetAddress = sourceRoute.tokenMessengerV2.toLowerCase();
        const allowance = await circleWalletService.getUsdcAllowance(walletAddress, approvalTargetAddress);
        if (allowance < amountBaseUnits) {
            const approvalChallenge = await circleWalletService.createContractExecutionChallenge({
                userToken: body.userToken,
                walletId: wallet.id,
                contractAddress: sourceRoute.usdcAddress,
                callData: (0, viem_1.encodeFunctionData)({
                    abi: erc20ApproveAbi,
                    functionName: "approve",
                    args: [sourceRoute.tokenMessengerV2, viem_1.maxUint256],
                }),
                refId: `arc-payroll-cctp-approve-${employee.id}-${Date.now()}`,
            });
            return {
                kind: "cctp_approval",
                walletAddress,
                walletId: wallet.id,
                challengeId: approvalChallenge.challengeId,
                blockchain: sourceRoute.displayName,
                tokenAddress: sourceRoute.usdcAddress,
                symbol: "USDC",
                sourceChain: sourceRoute.displayName,
                destinationChain: destinationRoute.displayName,
                destinationDomain: destinationRoute.domain,
                destinationAddress: normalizedDestinationAddress,
                approvalTargetAddress,
                amount: Number(normalizedAmount),
                estimatedReceivedAmount: Number(normalizedAmount),
                maxFee: 0,
                transferSpeed,
            };
        }
        const maxFeeBaseUnits = config.chainMode === "live" && useForwarder
            ? await (0, cctp_1.fetchForwardingFee)(sourceRoute.domain, destinationRoute.domain, destinationRoute.isTestnet, finalityThreshold)
            : 0n;
        if (maxFeeBaseUnits >= amountBaseUnits) {
            throw new HttpError(400, "Amount is too small after CCTP forwarding fees.");
        }
        const contractExecutionChallenge = await circleWalletService.createContractExecutionChallenge({
            userToken: body.userToken,
            walletId: wallet.id,
            contractAddress: sourceRoute.tokenMessengerV2,
            callData: (0, viem_1.encodeFunctionData)({
                abi: tokenMessengerAbi,
                functionName: useForwarder ? "depositForBurnWithHook" : "depositForBurn",
                args: useForwarder
                    ? [
                        amountBaseUnits,
                        destinationRoute.domain,
                        bytes32FromAddress(normalizedDestinationAddress),
                        sourceRoute.usdcAddress,
                        `0x${"0".repeat(64)}`,
                        maxFeeBaseUnits,
                        finalityThreshold,
                        cctp_1.CCTP_FORWARDING_HOOK_DATA,
                    ]
                    : [
                        amountBaseUnits,
                        destinationRoute.domain,
                        bytes32FromAddress(normalizedDestinationAddress),
                        sourceRoute.usdcAddress,
                        `0x${"0".repeat(64)}`,
                        maxFeeBaseUnits,
                        finalityThreshold,
                    ],
            }),
            refId: `arc-payroll-cctp-transfer-${employee.id}-${Date.now()}`,
        });
        return {
            kind: "cctp_transfer",
            walletAddress,
            walletId: wallet.id,
            challengeId: contractExecutionChallenge.challengeId,
            blockchain: sourceRoute.displayName,
            tokenAddress: sourceRoute.usdcAddress,
            symbol: "USDC",
            sourceChain: sourceRoute.displayName,
            destinationChain: destinationRoute.displayName,
            destinationDomain: destinationRoute.domain,
            destinationAddress: normalizedDestinationAddress,
            approvalTargetAddress,
            amount: Number(normalizedAmount),
            estimatedReceivedAmount: Number(normalizedAmount) - usdcBaseUnitsToNumber(maxFeeBaseUnits),
            maxFee: usdcBaseUnitsToNumber(maxFeeBaseUnits),
            transferSpeed,
        };
    });
    app.get("/dashboard", async () => payrollService.getDashboardSummary());
    app.get("/recipients", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.listRecipients();
    });
    app.post("/recipients", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.createRecipient(recipientSchema.parse(request.body ?? {}));
    });
    app.patch("/recipients/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updateRecipient(params.id, recipientSchema.partial().parse(request.body ?? {}));
    });
    app.delete("/recipients/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.deleteRecipient(params.id);
    });
    app.post("/recipients/:id/access-code", async (request) => {
        const session = await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return authService.createRecipientAccessCode(params.id, session.address, (0, dates_1.nowIso)());
    });
    app.post("/onboarding/redeem", async (request) => {
        return authService.redeemInviteCode(onboardingCodeSchema.parse(request.body ?? {}).code, (0, dates_1.nowIso)());
    });
    app.post("/onboarding/wallet/challenge", async (request) => {
        const body = onboardingWalletChallengeSchema.parse(request.body ?? {});
        return authService.issueWalletClaimChallenge({
            code: body.code,
            address: body.address,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.post("/onboarding/wallet/claim", async (request) => {
        const body = onboardingWalletClaimSchema.parse(request.body ?? {});
        return authService.claimInviteWithWallet({
            code: body.code,
            address: body.address,
            message: body.message,
            signature: body.signature,
            profile: body.profile,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.post("/onboarding/circle/start", async (request) => {
        const body = onboardingCircleStartSchema.parse(request.body ?? {});
        return authService.startCircleOnboarding({
            code: body.code,
            deviceId: body.deviceId,
            profile: body.profile,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.post("/onboarding/circle/prepare", async (request) => {
        const body = onboardingCirclePrepareSchema.parse(request.body ?? {});
        return authService.prepareCircleOnboarding({
            code: body.code,
            userToken: body.userToken,
            profile: body.profile,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.post("/onboarding/circle/complete", async (request) => {
        const body = onboardingCircleCompleteSchema.parse(request.body ?? {});
        return authService.completeCircleOnboarding({
            code: body.code,
            userToken: body.userToken,
            profile: body.profile,
            nowIso: (0, dates_1.nowIso)(),
        });
    });
    app.get("/schedules", async () => payrollService.listSchedules());
    app.post("/schedules", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.createSchedule(scheduleSchema.parse(request.body ?? {}));
    });
    app.patch("/schedules/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updateSchedule(params.id, scheduleSchema.partial().parse(request.body ?? {}));
    });
    app.get("/holidays", async () => payrollService.listHolidays());
    app.post("/holidays", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.createHoliday(holidaySchema.parse(request.body ?? {}));
    });
    app.patch("/holidays/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updateHoliday(params.id, holidaySchema.partial().parse(request.body ?? {}));
    });
    app.get("/me/time-entries", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        const query = zod_1.z.object({
            start: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            end: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }).parse(request.query ?? {});
        return payrollService.getMyTimeEntries(session.address, query.start, query.end);
    });
    app.post("/me/time-entries/clock-in", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.clockIn(session.address, clockInSchema.parse(request.body ?? {}));
    });
    app.post("/me/time-entries/clock-out", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.clockOut(session.address, clockOutSchema.parse(request.body ?? {}));
    });
    app.get("/me/schedule", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.getMeSchedule(session.address);
    });
    app.get("/me/holidays", async (request) => {
        await getSessionOrThrow(request, authService, "employee");
        return payrollService.getMeHolidays();
    });
    app.get("/me/time-off", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.listMyTimeOff(session.address);
    });
    app.post("/me/time-off", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.createMyTimeOff(session.address, employeeTimeOffSchema.parse(request.body ?? {}));
    });
    app.patch("/me/time-off/:id", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updateMyTimeOff(session.address, params.id, employeeTimeOffUpdateSchema.parse(request.body ?? {}));
    });
    app.get("/me/earnings", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.getMyEarnings(session.address);
    });
    app.post("/me/withdraw", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.withdrawAvailableEarnings(session.address, withdrawSchema.parse(request.body ?? {}));
    });
    app.get("/employees/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.getEmployeeProfile(params.id);
    });
    app.get("/employees/:id/time-entries", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        const query = zod_1.z.object({
            start: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            end: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }).parse(request.query ?? {});
        return payrollService.getEmployeeTimeEntries(params.id, query.start, query.end);
    });
    app.get("/employees/:id/earnings", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.getEmployeeEarnings(params.id);
    });
    app.get("/pay-runs", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.listPayRuns();
    });
    app.post("/pay-runs", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.createPayRun(payRunSchema.parse(request.body ?? {}));
    });
    app.get("/pay-runs/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.getPayRun(params.id);
    });
    app.patch("/pay-runs/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updatePayRun(params.id, payRunSchema.partial().parse(request.body ?? {}));
    });
    app.post("/pay-runs/:id/approve", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.approvePayRun(params.id);
    });
    app.post("/pay-runs/:id/execute", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.executePayRun(params.id);
    });
    app.post("/pay-runs/:id/finalize", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.finalizePayRun(params.id);
    });
    app.get("/treasury/balances", async () => payrollService.getTreasury());
    app.get("/treasury/auto-policy", async () => (await payrollService.getTreasury()).autoPolicy);
    app.post("/treasury/auto-policy", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.updateAutoPolicy(autoPolicySchema.parse(request.body ?? {}));
    });
    app.post("/treasury/rebalance", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.manualRebalance(rebalanceSchema.parse(request.body ?? {}));
    });
    app.get("/policies", async () => payrollService.listPolicies());
    app.post("/policies", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.createPolicy(policySchema.parse(request.body ?? {}));
    });
    app.patch("/policies/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updatePolicy(params.id, policySchema.partial().parse(request.body ?? {}));
    });
    app.post("/jobs/run", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return jobService.runScheduledTasks();
    });
    app.get("/time-off/policy", async (request) => {
        await getSessionOrThrow(request, authService);
        return payrollService.getTimeOffPolicy();
    });
    app.patch("/time-off/policy", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.updateTimeOffPolicy(timeOffPolicySchema.parse(request.body ?? {}));
    });
    app.get("/time-off/requests", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        return payrollService.listTimeOffRequests();
    });
    app.patch("/time-off/requests/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.reviewTimeOffRequest(params.id, adminTimeOffReviewSchema.parse(request.body ?? {}));
    });
    app.addHook("onClose", async () => {
        repository.close();
    });
    return {
        app,
        repository,
        services: {
            authService,
            payrollService,
            jobService,
            chainService,
            circleWalletService,
        },
    };
}
