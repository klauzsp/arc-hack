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

interface ChainTreasurySnapshot {
  coreAddress: `0x${string}`;
  controllerAddress: `0x${string}`;
  payRunAddress: `0x${string}`;
  rebalanceAddress: `0x${string}`;
  treasuryUsdcBaseUnits: bigint;
  controllerUsdcBaseUnits: bigint;
  controllerUsycBaseUnits: bigint;
}

function toUsdcBaseUnits(cents: number) {
  return BigInt(cents) * 10_000n;
}

function createMockHash(seed: string) {
  return `0x${seed.replace(/[^a-z0-9]/gi, "").padEnd(64, "a").slice(0, 64)}`;
}

export class ChainService {
  private readonly config: AppConfig;
  private readonly account;
  private readonly walletClient;
  private readonly publicClient;

  private readonly coreAbi = parseAbi([
    "function treasuryBalance() view returns (uint256)",
    "function withdraw(address to, uint256 amount)",
    "function transferPayroll(address recipient, uint256 amount)",
  ]);

  private readonly payRunAbi = parseAbi([
    "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] chainIds) returns (uint256)",
    "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
    "function finalizePayRun(bytes32 payRunId)",
  ]);

  private readonly tellerAbi = parseAbi([
    "function deposit(uint256 assets, address receiver) returns (uint256)",
    "function redeem(uint256 shares, address receiver, address account) returns (uint256)",
  ]);

  private readonly erc20Abi = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ]);

  constructor(config: AppConfig) {
    this.config = config;
    this.account =
      this.config.chainMode === "live" && this.config.liveChain
        ? privateKeyToAccount(this.config.liveChain.privateKey)
        : null;
    this.walletClient = this.createWalletClient();
    this.publicClient = this.createPublicClient();
  }

  private createWalletClient() {
    if (this.config.chainMode !== "live" || !this.config.liveChain || !this.account) return null;
    return createWalletClient({
      account: this.account,
      transport: http(this.config.liveChain.rpcUrl),
    });
  }

  private createPublicClient() {
    if (this.config.chainMode !== "live" || !this.config.liveChain) return null;
    return createPublicClient({
      transport: http(this.config.liveChain.rpcUrl),
    });
  }

  private requireLiveClients() {
    if (!this.walletClient || !this.publicClient || !this.config.liveChain || !this.account) {
      throw new Error("Live chain client is not configured.");
    }

    return {
      walletClient: this.walletClient,
      publicClient: this.publicClient,
      liveChain: this.config.liveChain,
      account: this.account,
    };
  }

  createOnChainPayRunId(payRunId: string) {
    return keccak256(stringToHex(payRunId));
  }

  async getTreasurySnapshot(): Promise<ChainTreasurySnapshot | null> {
    if (this.config.chainMode !== "live") return null;

    const { publicClient, liveChain, account } = this.requireLiveClients();
    const [treasuryUsdcBaseUnits, controllerUsdcBaseUnits, controllerUsycBaseUnits] = await Promise.all([
      publicClient.readContract({
        address: liveChain.coreAddress,
        abi: this.coreAbi,
        functionName: "treasuryBalance",
      }),
      publicClient.readContract({
        address: liveChain.usdcAddress,
        abi: this.erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.readContract({
        address: liveChain.usycAddress,
        abi: this.erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
    ]);

    return {
      coreAddress: liveChain.coreAddress,
      controllerAddress: account.address,
      payRunAddress: liveChain.payRunAddress,
      rebalanceAddress: liveChain.rebalanceAddress,
      treasuryUsdcBaseUnits,
      controllerUsdcBaseUnits,
      controllerUsycBaseUnits,
    };
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

  async transferPayroll(recipient: `0x${string}`, amountCents: number) {
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`withdraw-${recipient}-${amountCents}`);
    }

    const txHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.coreAddress,
      abi: this.coreAbi,
      functionName: "transferPayroll",
      args: [recipient, toUsdcBaseUnits(amountCents)],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  async finalizePayRun(payRun: PayRunRecord) {
    const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`finalize-${payRun.id}`);
    }

    const txHash = await this.walletClient.writeContract({
      chain: undefined,
      address: this.config.liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "finalizePayRun",
      args: [onChainId as `0x${string}`],
    });
    await this.publicClient?.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  async rebalanceUsdcToUsyc(amountCents: number) {
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`usdc-to-usyc-${amountCents}`);
    }

    const { walletClient, publicClient, liveChain, account } = this.requireLiveClients();
    const amount = toUsdcBaseUnits(amountCents);
    const fundingTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.coreAddress,
      abi: this.coreAbi,
      functionName: "withdraw",
      args: [account.address, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundingTxHash });

    const approvalTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.usdcAddress,
      abi: this.erc20Abi,
      functionName: "approve",
      args: [liveChain.usycTellerAddress, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });

    const depositTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.usycTellerAddress,
      abi: this.tellerAbi,
      functionName: "deposit",
      args: [amount, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
    return depositTxHash;
  }

  async rebalanceUsycToUsdc(amountCents: number) {
    if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
      return createMockHash(`usyc-to-usdc-${amountCents}`);
    }

    const { walletClient, publicClient, liveChain, account } = this.requireLiveClients();
    const amount = toUsdcBaseUnits(amountCents);
    const controllerUsdcBefore = await publicClient.readContract({
      address: liveChain.usdcAddress,
      abi: this.erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    const approvalTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.usycAddress,
      abi: this.erc20Abi,
      functionName: "approve",
      args: [liveChain.usycTellerAddress, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });

    const redeemTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.usycTellerAddress,
      abi: this.tellerAbi,
      functionName: "redeem",
      args: [amount, account.address, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: redeemTxHash });

    const controllerUsdcAfter = await publicClient.readContract({
      address: liveChain.usdcAddress,
      abi: this.erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    const returnedAmount = controllerUsdcAfter > controllerUsdcBefore ? controllerUsdcAfter - controllerUsdcBefore : amount;

    const returnTxHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.usdcAddress,
      abi: this.erc20Abi,
      functionName: "transfer",
      args: [liveChain.coreAddress, returnedAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: returnTxHash });
    return returnTxHash;
  }
}
