import path from "node:path";

export type ChainMode = "mock" | "live";

export interface LiveChainConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  coreAddress: `0x${string}`;
  payRunAddress: `0x${string}`;
  rebalanceAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
  usycAddress: `0x${string}`;
  usycTellerAddress: `0x${string}`;
  stableFxApiKey?: string;
}

export interface AppConfig {
  host: string;
  port: number;
  corsOrigin: string;
  dbPath: string;
  sessionTtlHours: number;
  companyId: string;
  companyName: string;
  adminWallet: string;
  seedDate: string;
  jobsEnabled: boolean;
  arcChainId: number;
  chainMode: ChainMode;
  liveChain?: LiveChainConfig;
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const chainMode = (env.CHAIN_MODE?.toLowerCase() === "live" ? "live" : "mock") satisfies ChainMode;
  const defaultDbPath = path.resolve(process.cwd(), "backend", "data", "payroll.sqlite");
  const defaultArcRpcUrl = "https://rpc.testnet.arc.network";
  const dbPath =
    env.BACKEND_DB_PATH === ":memory:"
      ? ":memory:"
      : env.BACKEND_DB_PATH
        ? path.resolve(env.BACKEND_DB_PATH)
        : defaultDbPath;

  const config: AppConfig = {
    host: env.BACKEND_HOST ?? "127.0.0.1",
    port: parseNumber(env.BACKEND_PORT, 3001),
    corsOrigin: env.BACKEND_CORS_ORIGIN ?? "http://localhost:3000",
    dbPath,
    sessionTtlHours: parseNumber(env.BACKEND_SESSION_TTL_HOURS, 24),
    companyId: env.BACKEND_COMPANY_ID ?? "company-arc",
    companyName: env.BACKEND_COMPANY_NAME ?? "Arc Payroll Demo",
    adminWallet:
      (env.BACKEND_ADMIN_WALLET ?? "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0").toLowerCase(),
    seedDate: env.BACKEND_SEED_DATE ?? "2026-02-28",
    jobsEnabled: parseBoolean(env.BACKEND_JOBS_ENABLED, false),
    arcChainId: parseNumber(env.BACKEND_ARC_CHAIN_ID, 5_042_002),
    chainMode,
  };

  if (chainMode === "live") {
    const rpcUrl = env.BACKEND_RPC_URL ?? env.NEXT_PUBLIC_ARC_RPC_URL ?? defaultArcRpcUrl;
    const privateKey = env.BACKEND_PRIVATE_KEY as `0x${string}` | undefined;
    const coreAddress = env.BACKEND_CORE_ADDRESS as `0x${string}` | undefined;
    const payRunAddress = env.BACKEND_PAYRUN_ADDRESS as `0x${string}` | undefined;
    const rebalanceAddress = env.BACKEND_REBALANCE_ADDRESS as `0x${string}` | undefined;
    const usdcAddress = (env.BACKEND_USDC_ADDRESS ??
      "0x3600000000000000000000000000000000000000") as `0x${string}`;
    const usycAddress = (env.BACKEND_USYC_ADDRESS ??
      "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C") as `0x${string}`;
    const usycTellerAddress = (env.BACKEND_USYC_TELLER_ADDRESS ??
      "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A") as `0x${string}`;
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

  return config;
}
