import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  privateKey: process.env.PRIVATE_KEY || "",
  contracts: {
    core: process.env.CORE_ADDRESS || "",
    payRun: process.env.PAYRUN_ADDRESS || "",
    rebalance: process.env.REBALANCE_ADDRESS || "",
    vesting: process.env.VESTING_ADDRESS || "",
    usdc: process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000",
    usyc: process.env.USYC_ADDRESS || "0x38D3A3f8717F4DB1CcB4Ad7D8C755919440848A3",
  },
  siwe: {
    domain: process.env.SIWE_DOMAIN || "localhost",
    uri: process.env.SIWE_URI || "http://localhost:4000",
  },
  rebalance: {
    idleThreshold: BigInt(process.env.REBALANCE_IDLE_THRESHOLD || "50000000000"),
    bufferHours: parseInt(process.env.REBALANCE_BUFFER_HOURS || "24", 10),
  },
} as const;
