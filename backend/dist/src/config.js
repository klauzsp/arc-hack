"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_path_1 = __importDefault(require("node:path"));
function parseNumber(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function parseBoolean(value, fallback) {
    if (!value)
        return fallback;
    return value === "1" || value.toLowerCase() === "true";
}
function loadConfig(env = process.env) {
    const chainMode = (env.CHAIN_MODE?.toLowerCase() === "live" ? "live" : "mock");
    const defaultDbPath = node_path_1.default.resolve(process.cwd(), "backend", "data", "payroll.sqlite");
    const config = {
        host: env.BACKEND_HOST ?? "127.0.0.1",
        port: parseNumber(env.BACKEND_PORT, 3001),
        corsOrigin: env.BACKEND_CORS_ORIGIN ?? "http://localhost:3000",
        dbPath: env.BACKEND_DB_PATH ? node_path_1.default.resolve(env.BACKEND_DB_PATH) : defaultDbPath,
        sessionTtlHours: parseNumber(env.BACKEND_SESSION_TTL_HOURS, 24),
        companyId: env.BACKEND_COMPANY_ID ?? "company-arc",
        companyName: env.BACKEND_COMPANY_NAME ?? "Arc Payroll Demo",
        adminWallet: (env.BACKEND_ADMIN_WALLET ?? "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0").toLowerCase(),
        seedDate: env.BACKEND_SEED_DATE ?? "2026-02-28",
        jobsEnabled: parseBoolean(env.BACKEND_JOBS_ENABLED, false),
        arcChainId: parseNumber(env.BACKEND_ARC_CHAIN_ID, 10_001),
        chainMode,
    };
    if (chainMode === "live") {
        const rpcUrl = env.BACKEND_RPC_URL;
        const privateKey = env.BACKEND_PRIVATE_KEY;
        const coreAddress = env.BACKEND_CORE_ADDRESS;
        const payRunAddress = env.BACKEND_PAYRUN_ADDRESS;
        const rebalanceAddress = env.BACKEND_REBALANCE_ADDRESS;
        if (!rpcUrl || !privateKey || !coreAddress || !payRunAddress || !rebalanceAddress) {
            throw new Error("Live chain mode requires BACKEND_RPC_URL, BACKEND_PRIVATE_KEY, BACKEND_CORE_ADDRESS, BACKEND_PAYRUN_ADDRESS, and BACKEND_REBALANCE_ADDRESS.");
        }
        config.liveChain = {
            rpcUrl,
            privateKey,
            coreAddress,
            payRunAddress,
            rebalanceAddress,
        };
    }
    return config;
}
