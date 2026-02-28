"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const zod_1 = require("zod");
const repository_1 = require("./repository");
const authService_1 = require("./services/authService");
const chainService_1 = require("./services/chainService");
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
    walletAddress: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    payType: zod_1.z.enum(["yearly", "daily", "hourly"]),
    rate: zod_1.z.number().nonnegative(),
    chainPreference: zod_1.z.string().nullable().optional(),
    destinationChainId: zod_1.z.number().nullable().optional(),
    destinationWalletAddress: zod_1.z.string().nullable().optional(),
    scheduleId: zod_1.z.string().nullable().optional(),
    timeTrackingMode: zod_1.z.enum(["check_in_out", "schedule_based"]),
    active: zod_1.z.boolean().optional(),
});
const scheduleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    timezone: zod_1.z.string().min(1),
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
    const authService = new authService_1.AuthService(repository, config);
    const jobService = new jobService_1.JobService(payrollService);
    const app = (0, fastify_1.default)({ logger: false });
    void app.register(cors_1.default, { origin: config.corsOrigin, credentials: true });
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
    app.get("/health", async () => ({ ok: true, mode: config.chainMode }));
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
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.updateRecipient(params.id, recipientSchema.partial().parse(request.body ?? {}));
    });
    app.delete("/recipients/:id", async (request) => {
        await getSessionOrThrow(request, authService, "admin");
        const params = zod_1.z.object({ id: zod_1.z.string().min(1) }).parse(request.params);
        return payrollService.deleteRecipient(params.id);
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
    app.get("/me/earnings", async (request) => {
        const session = await getSessionOrThrow(request, authService, "employee");
        return payrollService.getMyEarnings(session.address);
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
    app.get("/treasury/balances", async () => payrollService.getTreasury());
    app.get("/treasury/auto-policy", async () => payrollService.getTreasury().autoPolicy);
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
        },
    };
}
