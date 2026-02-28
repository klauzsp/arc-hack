import { createPublicClient, createWalletClient, http, keccak256, parseAbi, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config";
import type { PayRunItemRecord, PayRunRecord } from "../domain/types";

interface ChainCreatePayRunInput {
  payRun: PayRunRecord;
  items: PayRunItemRecord[];
}

interface ChainExecutePayRunResult {
  onChainId: string;
  txHash: string;
}

function toUsdcBaseUnits(cents: number) {
  return BigInt(cents) * 10_000n;
}

function createMockHash(seed: string) {
  return `0x${seed.replace(/[^a-z0-9]/gi, "").padEnd(64, "a").slice(0, 64)}`;
}

export class ChainService {
  private readonly config: AppConfig;
  private readonly walletClient;
  private readonly publicClient;

  private readonly coreAbi = parseAbi([
    "function withdraw(address to, uint256 amount)",
  ]);

  private readonly payRunAbi = parseAbi([
    "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] chainIds) returns (uint256)",
    "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
  ]);

  private readonly rebalanceAbi = parseAbi([
    "function usdcToUsyc(uint256 amount, address receiver) returns (uint256)",
    "function usycToUsdc(uint256 shares, address receiver) returns (uint256)",
  ]);

  constructor(config: AppConfig) {
    this.config = config;
    this.walletClient = this.createWalletClient();
    this.publicClient = this.createPublicClient();
  }

  private createWalletClient() {
    if (this.config.chainMode !== "live" || !this.config.liveChain) return null;
    const account = privateKeyToAccount(this.config.liveChain.privateKey);
    return createWalletClient({
      account,
      transport: http(this.config.liveChain.rpcUrl),
    });
  }

  private createPublicClient() {
    if (this.config.chainMode !== "live" || !this.config.liveChain) return null;
    return createPublicClient({
      transport: http(this.config.liveChain.rpcUrl),
    });
  }

  createOnChainPayRunId(payRunId: string) {
    return keccak256(stringToHex(payRunId));
  }

  async createPayRun(input: ChainCreatePayRunInput): Promise<string> {
    const onChainId = this.createOnChainPayRunId(input.payRun.id);
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return onChainId;
    }

    const recipients = input.items.map((item) => item.recipientWalletAddress as `0x${string}`);
    const amounts = input.items.map((item) => toUsdcBaseUnits(item.amountCents));
    const chainIds = input.items.map((item) => item.destinationChainId);
    const [periodStartYear, periodStartMonth, periodStartDay] = input.payRun.periodStart.split("-").map(Number);
    const [periodEndYear, periodEndMonth, periodEndDay] = input.payRun.periodEnd.split("-").map(Number);
    const periodStart = BigInt(Math.floor(Date.UTC(periodStartYear, periodStartMonth - 1, periodStartDay) / 1000));
    const periodEnd = BigInt(Math.floor(Date.UTC(periodEndYear, periodEndMonth - 1, periodEndDay) / 1000));

    const hash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "createPayRun",
      args: [onChainId, periodStart, periodEnd, recipients, amounts, chainIds],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash });

    return onChainId;
  }

  async executePayRun(payRun: PayRunRecord): Promise<ChainExecutePayRunResult> {
    const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return {
        onChainId,
        txHash: createMockHash(`execute-${payRun.id}`),
      };
    }

    const txHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "executePayRun",
      args: [onChainId as `0x${string}`],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: txHash });

    return { onChainId, txHash };
  }

  async rebalanceUsdcToUsyc(amountCents: number) {
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`usdc-to-usyc-${amountCents}`);
    }

    const amount = toUsdcBaseUnits(amountCents);
    const fundingTxHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.coreAddress,
      abi: this.coreAbi,
      functionName: "withdraw",
      args: [this.config.liveChain.rebalanceAddress, amount],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: fundingTxHash });

    const txHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.rebalanceAddress,
      abi: this.rebalanceAbi,
      functionName: "usdcToUsyc",
      args: [amount, this.config.liveChain.rebalanceAddress],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async rebalanceUsycToUsdc(amountCents: number) {
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`usyc-to-usdc-${amountCents}`);
    }

    const txHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.rebalanceAddress,
      abi: this.rebalanceAbi,
      functionName: "usycToUsdc",
      args: [toUsdcBaseUnits(amountCents), this.config.liveChain.coreAddress],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }
}
