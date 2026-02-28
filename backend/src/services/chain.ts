/**
 * Viem-based chain interaction service.
 * Provides read/write access to Core, PayRun, and Rebalance contracts.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hash,
  encodePacked,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { config } from "../config.js";

// ── ABIs (minimal) ──────────────────────────────────────────────────

const coreAbi = parseAbi([
  "function owner() view returns (address)",
  "function balance() view returns (uint256)",
  "function fundPayRun(bytes32 payRunId, uint256 amount)",
  "function withdraw(uint256 amount)",
  "function ensureLiquidity(uint256 requiredUsdc) returns (uint256)",
  "event PayRunFunded(bytes32 indexed payRunId, uint256 amount)",
]);

const payRunAbi = parseAbi([
  "function createPayRun(bytes32 payRunId, uint256 periodEnd, address[] recipients, uint256[] amounts, uint256[] chainIds)",
  "function executePayRun(bytes32 payRunId)",
  "function payRuns(bytes32) view returns (uint256 periodEnd, uint8 status, uint256 totalAmount, uint256 itemCount)",
  "function getPayRunItems(bytes32 payRunId) view returns ((address recipient, uint256 amount, uint256 chainId)[])",
  "function payRunCount() view returns (uint256)",
  "function getPayRunStatus(bytes32 payRunId) view returns (uint8)",
  "event PayRunCreated(bytes32 indexed payRunId, uint256 periodEnd, uint256 totalAmount, uint256 itemCount)",
  "event PayRunExecuted(bytes32 indexed payRunId, uint256 totalPaidOnChain, uint256 crossChainItems)",
]);

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// ── Clients ─────────────────────────────────────────────────────────

// Use foundry chain as base config with custom RPC
const chain = { ...foundry, rpcUrls: { default: { http: [config.rpcUrl] } } };

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

const account = config.privateKey
  ? privateKeyToAccount(config.privateKey as `0x${string}`)
  : undefined;

export const walletClient = account
  ? createWalletClient({ account, chain, transport: http(config.rpcUrl) })
  : undefined;

// ── Helpers ─────────────────────────────────────────────────────────

export function payRunIdFromString(id: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [id]));
}

// ── Treasury reads ──────────────────────────────────────────────────

export async function getTreasuryUsdcBalance(): Promise<bigint> {
  if (!config.contracts.core) return 0n;
  return publicClient.readContract({
    address: config.contracts.core as Address,
    abi: coreAbi,
    functionName: "balance",
  });
}

export async function getTokenBalance(token: Address, holder: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  });
}

// ── PayRun on-chain ops ──────────────────────────────────────────

export async function createPayRunOnChain(
  payRunId: string,
  periodEnd: number,
  recipients: Address[],
  amounts: bigint[],
  chainIds: bigint[]
): Promise<Hash> {
  if (!walletClient) throw new Error("No wallet configured");
  const id = payRunIdFromString(payRunId);
  return walletClient.writeContract({
    address: config.contracts.payRun as Address,
    abi: payRunAbi,
    functionName: "createPayRun",
    args: [id, BigInt(periodEnd), recipients, amounts, chainIds],
  });
}

export async function fundPayRunOnChain(payRunId: string, amount: bigint): Promise<Hash> {
  if (!walletClient) throw new Error("No wallet configured");
  const id = payRunIdFromString(payRunId);
  return walletClient.writeContract({
    address: config.contracts.core as Address,
    abi: coreAbi,
    functionName: "fundPayRun",
    args: [id, amount],
  });
}

export async function executePayRunOnChain(payRunId: string): Promise<Hash> {
  if (!walletClient) throw new Error("No wallet configured");
  const id = payRunIdFromString(payRunId);
  return walletClient.writeContract({
    address: config.contracts.payRun as Address,
    abi: payRunAbi,
    functionName: "executePayRun",
    args: [id],
  });
}

export async function getPayRunOnChainStatus(payRunId: string): Promise<number> {
  const id = payRunIdFromString(payRunId);
  return publicClient.readContract({
    address: config.contracts.payRun as Address,
    abi: payRunAbi,
    functionName: "getPayRunStatus",
    args: [id],
  }) as Promise<number>;
}
