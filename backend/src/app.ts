import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { AppConfig } from "./config";
import { PayrollRepository } from "./repository";
import { AuthService } from "./services/authService";
import { ChainService } from "./services/chainService";
import { CircleWalletService } from "./services/circleWalletService";
import { JobService } from "./services/jobService";
import { PayrollService } from "./services/payrollService";
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
  timeTrackingMode: z.enum(["check_in_out", "schedule_based"]),
  employmentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
});

const scheduleSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  hoursPerDay: z.number().positive(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
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

const onboardingWalletChallengeSchema = onboardingCodeSchema.extend({
  address: z.string().min(1),
});

const onboardingWalletClaimSchema = onboardingCodeSchema.extend({
  address: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().startsWith("0x"),
});

const onboardingCircleCompleteSchema = onboardingCodeSchema.extend({
  userToken: z.string().min(1),
});

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

  const app = Fastify({ logger: false });
  void app.register(cors, {
    origin: config.corsOrigin,
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

  app.get("/me", async (request) => {
    const session = await getSessionOrThrow(request, authService);
    return payrollService.getProfile(session.address);
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
      nowIso: nowIso(),
    });
  });
  app.post("/onboarding/circle/start", async (request) => {
    return authService.startCircleOnboarding(onboardingCodeSchema.parse(request.body ?? {}).code, nowIso());
  });
  app.post("/onboarding/circle/complete", async (request) => {
    const body = onboardingCircleCompleteSchema.parse(request.body ?? {});
    return authService.completeCircleOnboarding({
      code: body.code,
      userToken: body.userToken,
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
