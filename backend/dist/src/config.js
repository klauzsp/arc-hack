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
function workspaceRoot() {
    return node_path_1.default.basename(process.cwd()) === "backend" ? node_path_1.default.resolve(process.cwd(), "..") : process.cwd();
}
function resolveWorkspacePath(value) {
    return node_path_1.default.isAbsolute(value) ? value : node_path_1.default.resolve(workspaceRoot(), value);
}
function loadConfig(env = process.env) {
    const chainMode = (env.CHAIN_MODE?.toLowerCase() === "live" ? "live" : "mock");
    const defaultDbPath = resolveWorkspacePath(node_path_1.default.join("backend", "data", "payroll.sqlite"));
    const defaultArcRpcUrl = "https://rpc.testnet.arc.network";
    const dbPath = env.BACKEND_DB_PATH === ":memory:"
        ? ":memory:"
        : env.BACKEND_DB_PATH
            ? resolveWorkspacePath(env.BACKEND_DB_PATH)
            : defaultDbPath;
    const today = new Date().toISOString().slice(0, 10);
    const config = {
        host: env.BACKEND_HOST ?? "127.0.0.1",
        port: parseNumber(env.BACKEND_PORT, 3001),
        corsOrigin: env.BACKEND_CORS_ORIGIN ?? "http://localhost:3000",
        dbPath,
        sessionTtlHours: parseNumber(env.BACKEND_SESSION_TTL_HOURS, 24),
        companyId: env.BACKEND_COMPANY_ID ?? "company-arc",
        companyName: env.BACKEND_COMPANY_NAME ?? "Arc Payroll Demo",
        adminWallet: (env.BACKEND_ADMIN_WALLET ?? "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0").toLowerCase(),
        seedDate: env.BACKEND_SEED_DATE ?? today,
        jobsEnabled: parseBoolean(env.BACKEND_JOBS_ENABLED, false),
        arcChainId: parseNumber(env.BACKEND_ARC_CHAIN_ID, 5_042_002),
        chainMode,
        referenceNowOverride: env.BACKEND_REFERENCE_NOW?.trim() || undefined,
    };
    if (chainMode === "live") {
        const rpcUrl = env.BACKEND_RPC_URL ?? env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultArcRpcUrl;
        const privateKey = env.BACKEND_PRIVATE_KEY;
        const coreAddress = env.BACKEND_CORE_ADDRESS;
        const payRunAddress = env.BACKEND_PAYRUN_ADDRESS;
        const rebalanceAddress = env.BACKEND_REBALANCE_ADDRESS;
        const usdcAddress = (env.BACKEND_USDC_ADDRESS ??
            "0x3600000000000000000000000000000000000000");
        const usycAddress = (env.BACKEND_USYC_ADDRESS ??
            "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C");
        const usycTellerAddress = (env.BACKEND_USYC_TELLER_ADDRESS ??
            "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A");
        const stableFxApiKey = env.STABLE_FX_API_KEY?.trim() || undefined;
        if (!rpcUrl || !privateKey || !coreAddress || !payRunAddress || !rebalanceAddress) {
            throw new Error("Live chain mode requires BACKEND_RPC_URL, BACKEND_PRIVATE_KEY, BACKEND_CORE_ADDRESS, BACKEND_PAYRUN_ADDRESS, and BACKEND_REBALANCE_ADDRESS.");
        }
        config.liveChain = {
            rpcUrl,
            privateKey,
            coreAddress,
            payRunAddress,
            rebalanceAddress,
            usdcAddress,
            usycAddress,
            usycTellerAddress,
            stableFxApiKey,
        };
    }
    const circleApiKey = env.CIRCLE_API_KEY?.trim();
    const circleAppId = env.CIRCLE_APP_ID?.trim();
    if (circleApiKey && circleAppId) {
        config.circle = {
            apiBaseUrl: env.CIRCLE_API_BASE_URL?.trim() || "https://api.circle.com",
            apiKey: circleApiKey,
            appId: circleAppId,
            walletBlockchain: env.CIRCLE_WALLET_BLOCKCHAIN?.trim() || "ARC-TESTNET",
            accountType: env.CIRCLE_ACCOUNT_TYPE?.trim().toUpperCase() === "SCA" ? "SCA" : "EOA",
        };
    }
    return config;
}
