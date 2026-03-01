import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { encodeFunctionData, isAddress, maxUint256, parseAbi, parseUnits } from "viem";
import { AppConfig } from "./config";
import {
  ARC_TESTNET_CCTP_DOMAIN,
  CCTP_FAST_FINALITY_THRESHOLD,
  CCTP_FORWARDING_HOOK_DATA,
  CCTP_SLOW_FINALITY_THRESHOLD,
  fetchForwardingFee,
  getCctpRouteByPreference,
} from "./lib/cctp";
import { PayrollRepository } from "./repository";
import { AuthService } from "./services/authService";
import { ChainService } from "./services/chainService";
import { CircleWalletService } from "./services/circleWalletService";
import { JobService } from "./services/jobService";
import { PayrollService } from "./services/payrollService";
import { AnomalyDetectionAgent } from "./services/anomalyDetectionAgent";
import { StorkOracleService } from "./services/storkOracleService";
import { nowIso } from "./lib/dates";

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const recipientSchema = z.object({
  walletAddress: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
  payType: z.enum(["yearly", "daily", "hourly"]),
  rate: z.number().nonnegative(),
  chainPreference: z.string().nullable().optional(),
  destinationChainId: z.number().nullable().optional(),
  destinationWalletAddress: z.string().nullable().optional(),
  scheduleId: z.string().nullable().optional(),
  timeTrackingMode: z.enum(["check_in_out", "schedule_based"]).optional(),
  employmentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
});

const scheduleSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  hoursPerDay: z.number().positive(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
  maxTimeOffDaysPerYear: z.number().int().positive().nullable().optional(),
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
});

const policySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["payday", "treasury_threshold", "manual"]),
  status: z.enum(["active", "paused"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  lastRunAt: z.string().nullable().optional(),
});

const payRunSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string()).optional(),
});

const rebalanceSchema = z.object({
  direction: z.enum(["usdc_to_usyc", "usyc_to_usdc"]),
  amount: z.number().positive(),
});

const autoPolicySchema = z.object({
  autoRebalanceEnabled: z.boolean().optional(),
  autoRedeemEnabled: z.boolean().optional(),
  rebalanceThreshold: z.number().nonnegative().optional(),
  payoutNoticeHours: z.number().int().positive().optional(),
});

const clockInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clockIn: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const clockOutSchema = z.object({
  clockOut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const withdrawSchema = z.object({
  amount: z.number().positive().optional(),
});

const timeOffPolicySchema = z.object({
  maxDaysPerYear: z.number().int().positive(),
});

const employeeTimeOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).nullable().optional(),
});

const employeeTimeOffUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).nullable().optional(),
  status: z.enum(["cancelled"]).optional(),
});

const adminTimeOffReviewSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled"]),
});

const onboardingCodeSchema = z.object({
  code: z.string().min(6),
});

const circleGoogleDeviceTokenSchema = z.object({
  deviceId: z.string().min(1),
});

const circleGoogleVerifySchema = z.object({
  userToken: z.string().min(1),
});

const onboardingWalletChallengeSchema = onboardingCodeSchema.extend({
  address: z.string().min(1),
});

const onboardingProfileSchema = z.object({
  chainPreference: z.string().min(1).nullable().optional(),
});

const onboardingWalletClaimSchema = onboardingCodeSchema.extend({
  address: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().startsWith("0x"),
  profile: onboardingProfileSchema.optional(),
});

const onboardingCircleStartSchema = onboardingCodeSchema.extend({
  deviceId: z.string().min(1),
  profile: onboardingProfileSchema.optional(),
});

const onboardingCirclePrepareSchema = onboardingCodeSchema.extend({
  userToken: z.string().min(1),
  profile: onboardingProfileSchema.optional(),
});

const onboardingCircleCompleteSchema = onboardingCodeSchema.extend({
  userToken: z.string().min(1),
  profile: onboardingProfileSchema.optional(),
});

const circleWalletSessionSchema = z.object({
  userToken: z.string().min(1),
});

const circleWalletTransferSchema = circleWalletSessionSchema.extend({
  destinationAddress: z.string().min(1),
  amount: z.string().min(1),
  destinationPreference: z.string().min(1).optional(),
});

const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const tokenMessengerAbi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);

async function getSessionOrThrow(
  request: { headers: Record<string, unknown> },
  authService: AuthService,
  requiredRole?: "admin" | "employee",
) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token.");
  }
  const token = authorization.slice("Bearer ".length).trim();
  const session = authService.getSession(token, nowIso());
  if (!session) throw new HttpError(401, "Session expired or invalid.");
  if (requiredRole && session.role !== requiredRole) throw new HttpError(403, "Insufficient permissions.");
  return session;
}

function normalizeUsdcAmount(value: string) {
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

function bytes32FromAddress(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

function usdcBaseUnitsToNumber(value: bigint) {
  return Number(value) / 1_000_000;
}

export function buildApp(config: AppConfig) {
  const repository = new PayrollRepository(config.dbPath);
  repository.initialize({
    companyId: config.companyId,
    companyName: config.companyName,
    today: config.seedDate,
    arcChainId: config.arcChainId,
  });

  const chainService = new ChainService(config);
  const payrollService = new PayrollService(repository, config, chainService);
  const circleWalletService = new CircleWalletService(config);
  const authService = new AuthService(repository, config, circleWalletService);
  const jobService = new JobService(payrollService);
  const storkOracleService = new StorkOracleService();
  const anomalyAgent = new AnomalyDetectionAgent(storkOracleService);

  const app = Fastify({ logger: false });
  void app.register(cors, {
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
    if (error instanceof ZodError) {
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
    const body = z.object({ address: z.string().min(1) }).parse(request.body ?? {});
    return authService.issueChallenge(body.address, nowIso());
  });

  app.post("/auth/verify", async (request) => {
    const body = z.object({
      address: z.string().min(1),
      message: z.string().min(1),
      signature: z.string().startsWith("0x"),
    }).parse(request.body ?? {});
    return authService.verifyChallenge({
      address: body.address,
      message: body.message,
      signature: body.signature as `0x${string}`,
      nowIso: nowIso(),
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
      nowIso: nowIso(),
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
    if (!isAddress(body.destinationAddress)) {
      throw new HttpError(400, "Destination wallet address is invalid.");
    }
    if (body.destinationAddress.toLowerCase() === session.address.toLowerCase()) {
      throw new HttpError(400, "Destination wallet must be different from your payroll wallet.");
    }

    const wallet = await circleWalletService.getArcWallet(body.userToken);
    const walletAddress = wallet?.address?.toLowerCase();
    if (!wallet?.id || !walletAddress || !isAddress(walletAddress)) {
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
    const destinationRoute = getCctpRouteByPreference(body.destinationPreference ?? "Arc");
    const amountBaseUnits = parseUnits(normalizedAmount, 6);

    if (destinationRoute.domain === ARC_TESTNET_CCTP_DOMAIN) {
      const transfer = await circleWalletService.createTransferChallenge({
        userToken: body.userToken,
        walletId: wallet.id,
        destinationAddress: normalizedDestinationAddress,
        amount: normalizedAmount,
        refId: `arc-payroll-transfer-${employee.id}-${Date.now()}`,
      });

      return {
        kind: "same_chain_transfer" as const,
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
        transferSpeed: "instant" as const,
      };
    }

    const sourceRoute = getCctpRouteByPreference("Arc");
    const finalityThreshold = sourceRoute.fastSourceSupported
      ? CCTP_FAST_FINALITY_THRESHOLD
      : CCTP_SLOW_FINALITY_THRESHOLD;
    const transferSpeed = sourceRoute.fastSourceSupported ? "fast" : "standard";
    const useForwarder = destinationRoute.forwarderSupported;
    const approvalTargetAddress = sourceRoute.tokenMessengerV2.toLowerCase();
    const allowance = await circleWalletService.getUsdcAllowance(walletAddress, approvalTargetAddress);

    if (allowance < amountBaseUnits) {
      const approvalChallenge = await circleWalletService.createContractExecutionChallenge({
        userToken: body.userToken,
        walletId: wallet.id,
        contractAddress: sourceRoute.usdcAddress,
        callData: encodeFunctionData({
          abi: erc20ApproveAbi,
          functionName: "approve",
          args: [sourceRoute.tokenMessengerV2, maxUint256],
        }),
        refId: `arc-payroll-cctp-approve-${employee.id}-${Date.now()}`,
      });

      return {
        kind: "cctp_approval" as const,
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

    const maxFeeBaseUnits =
      config.chainMode === "live" && useForwarder
        ? await fetchForwardingFee(
            sourceRoute.domain,
            destinationRoute.domain,
            destinationRoute.isTestnet,
            finalityThreshold,
          )
        : 0n;
    if (maxFeeBaseUnits >= amountBaseUnits) {
      throw new HttpError(400, "Amount is too small after CCTP forwarding fees.");
    }

    const contractExecutionChallenge = await circleWalletService.createContractExecutionChallenge({
      userToken: body.userToken,
      walletId: wallet.id,
      contractAddress: sourceRoute.tokenMessengerV2,
      callData: encodeFunctionData({
        abi: tokenMessengerAbi,
        functionName: useForwarder ? "depositForBurnWithHook" : "depositForBurn",
        args: useForwarder
          ? [
              amountBaseUnits,
              destinationRoute.domain,
              bytes32FromAddress(normalizedDestinationAddress),
              sourceRoute.usdcAddress,
              `0x${"0".repeat(64)}` as `0x${string}`,
              maxFeeBaseUnits,
              finalityThreshold,
              CCTP_FORWARDING_HOOK_DATA,
            ]
          : [
              amountBaseUnits,
              destinationRoute.domain,
              bytes32FromAddress(normalizedDestinationAddress),
              sourceRoute.usdcAddress,
              `0x${"0".repeat(64)}` as `0x${string}`,
              maxFeeBaseUnits,
              finalityThreshold,
            ],
      }),
      refId: `arc-payroll-cctp-transfer-${employee.id}-${Date.now()}`,
    });

    return {
      kind: "cctp_transfer" as const,
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.updateRecipient(params.id, recipientSchema.partial().parse(request.body ?? {}));
  });

  app.delete("/recipients/:id", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.deleteRecipient(params.id);
  });
  app.post("/recipients/:id/access-code", async (request) => {
    const session = await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return authService.createRecipientAccessCode(params.id, session.address, nowIso());
  });

  app.post("/onboarding/redeem", async (request) => {
    return authService.redeemInviteCode(onboardingCodeSchema.parse(request.body ?? {}).code, nowIso());
  });
  app.post("/onboarding/wallet/challenge", async (request) => {
    const body = onboardingWalletChallengeSchema.parse(request.body ?? {});
    return authService.issueWalletClaimChallenge({
      code: body.code,
      address: body.address,
      nowIso: nowIso(),
    });
  });
  app.post("/onboarding/wallet/claim", async (request) => {
    const body = onboardingWalletClaimSchema.parse(request.body ?? {});
    return authService.claimInviteWithWallet({
      code: body.code,
      address: body.address,
      message: body.message,
      signature: body.signature as `0x${string}`,
      profile: body.profile,
      nowIso: nowIso(),
    });
  });
  app.post("/onboarding/circle/start", async (request) => {
    const body = onboardingCircleStartSchema.parse(request.body ?? {});
    return authService.startCircleOnboarding({
      code: body.code,
      deviceId: body.deviceId,
      profile: body.profile,
      nowIso: nowIso(),
    });
  });
  app.post("/onboarding/circle/prepare", async (request) => {
    const body = onboardingCirclePrepareSchema.parse(request.body ?? {});
    return authService.prepareCircleOnboarding({
      code: body.code,
      userToken: body.userToken,
      profile: body.profile,
      nowIso: nowIso(),
    });
  });
  app.post("/onboarding/circle/complete", async (request) => {
    const body = onboardingCircleCompleteSchema.parse(request.body ?? {});
    return authService.completeCircleOnboarding({
      code: body.code,
      userToken: body.userToken,
      profile: body.profile,
      nowIso: nowIso(),
    });
  });

  app.get("/schedules", async () => payrollService.listSchedules());
  app.post("/schedules", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    return payrollService.createSchedule(scheduleSchema.parse(request.body ?? {}));
  });
  app.patch("/schedules/:id", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.updateSchedule(params.id, scheduleSchema.partial().parse(request.body ?? {}));
  });

  app.get("/holidays", async () => payrollService.listHolidays());
  app.post("/holidays", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    return payrollService.createHoliday(holidaySchema.parse(request.body ?? {}));
  });
  app.patch("/holidays/:id", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.updateHoliday(params.id, holidaySchema.partial().parse(request.body ?? {}));
  });

  app.get("/me/time-entries", async (request) => {
    const session = await getSessionOrThrow(request, authService, "employee");
    const query = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.getEmployeeProfile(params.id);
  });
  app.get("/employees/:id/time-entries", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query ?? {});
    return payrollService.getEmployeeTimeEntries(params.id, query.start, query.end);
  });
  app.get("/employees/:id/earnings", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.getPayRun(params.id);
  });
  app.patch("/pay-runs/:id", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.updatePayRun(params.id, payRunSchema.partial().parse(request.body ?? {}));
  });
  app.delete("/pay-runs/:id", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    payrollService.deletePayRun(params.id);
    return { ok: true };
  });
  app.post("/pay-runs/:id/approve", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.approvePayRun(params.id);
  });
  app.post("/pay-runs/:id/execute", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.executePayRun(params.id);
  });
  app.post("/pay-runs/:id/finalize", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
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
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return payrollService.reviewTimeOffRequest(params.id, adminTimeOffReviewSchema.parse(request.body ?? {}));
  });

  // ── Anomaly Detection Agent ─────────────────────────────────────────────

  app.post("/anomalies/scan", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const employees = repository.listEmployees();
    const timeEntries = employees.flatMap((e) => repository.listTimeEntries(e.id));
    const payRuns = repository.listPayRuns();
    const schedules = repository.listSchedules();
    const result = anomalyAgent.scan(employees, timeEntries, payRuns, schedules, config.companyId, config.seedDate);

    // For anomalies that trigger USYC rebalance, execute the rebalance
    for (const anomaly of result.anomalies) {
      if (anomaly.action === "usyc_rebalance") {
        try {
          const rebalanceResult = await payrollService.manualRebalance({
            direction: "usyc_to_usdc",
            amount: 100, // Rebalance $100 USYC → USDC as protective measure
          });
          anomalyAgent.setRebalanceTxHash(anomaly.id, rebalanceResult.txHash);
          anomaly.rebalanceTxHash = rebalanceResult.txHash;
        } catch {
          // Rebalance may fail if insufficient USYC; anomaly still recorded
        }
      }
    }

    return result;
  });

  app.get("/anomalies", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const query = z.object({
      employeeId: z.string().optional(),
      status: z.string().optional(),
    }).parse(request.query ?? {});
    return anomalyAgent.getAnomalies(query);
  });

  app.get("/anomalies/summary", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    return anomalyAgent.getSummary();
  });

  app.patch("/anomalies/:id/resolve", async (request) => {
    const session = await getSessionOrThrow(request, authService, "admin");
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({
      resolution: z.enum(["confirmed", "review_dismissed"]),
    }).parse(request.body ?? {});
    const result = anomalyAgent.resolveAnomaly(params.id, body.resolution, session.address);
    if (!result) throw new HttpError(404, "Anomaly not found.");
    return result;
  });

  app.get("/anomalies/reputations", async (request) => {
    await getSessionOrThrow(request, authService, "admin");
    const employees = repository.listEmployees();
    return storkOracleService.getReputations(employees.map((e) => e.id));
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
      anomalyAgent,
      storkOracleService,
    },
  };
}
