import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config";
import type { PayRunItemPreview, PayRunItemRecord, PayRunRecord } from "../domain/types";
import {
  ARC_TESTNET_CCTP_DOMAIN,
  CCTP_SLOW_FINALITY_THRESHOLD,
  fetchAttestationMessages,
  fetchForwardingFee,
  getCctpRouteByDomain,
  isArcDomain,
} from "../lib/cctp";

interface ChainCreatePayRunInput {
  payRun: PayRunRecord;
  items: PayRunItemRecord[];
}

interface ChainCrossChainMessage {
  itemId: string;
  nonce: string | null;
}

interface ChainExecutePayRunResult {
  onChainId: string;
  txHash: string;
  crossChainMessages: ChainCrossChainMessage[];
}

interface ChainFinalizePayRunResult {
  status: "processing" | "executed" | "failed";
  txHash: string | null;
  itemUpdates: Array<{
    itemId: string;
    status: "paid" | "processing" | "failed";
    txHash: string | null;
  }>;
}

interface AttestationMessagePayload {
  status?: string;
  attestation?: string;
  message?: string;
  forwardTxHash?: string | null;
  forwardState?: string | null;
  eventNonce?: string;
  decodedMessage?: Record<string, unknown>;
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

function bytes32FromAddress(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
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
    "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] destinationDomains, uint256[] maxFees, uint32[] minFinalityThresholds, bool[] useForwarders) returns (uint256)",
    "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
    "function finalizePayRun(bytes32 payRunId)",
    "function markFailed(bytes32 payRunId)",
  ]);

  private readonly tokenMessengerEventAbi = parseAbi([
    "event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint256 minFinalityThreshold, bytes hookData)",
  ]);

  private readonly messageTransmitterAbi = parseAbi([
    "function receiveMessage(bytes message, bytes attestation) returns (bool)",
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

  private destinationClients(destinationDomain: number) {
    const route = getCctpRouteByDomain(destinationDomain);
    if (!route) {
      throw new Error(`Unsupported CCTP destination domain ${destinationDomain}.`);
    }
    if (!this.account) {
      throw new Error("Live chain client is not configured.");
    }

    return {
      route,
      publicClient: createPublicClient({
        transport: http(route.rpcUrl),
      }),
      walletClient: createWalletClient({
        account: this.account,
        transport: http(route.rpcUrl),
      }),
    };
  }

  createOnChainPayRunId(payRunId: string) {
    return keccak256(stringToHex(payRunId));
  }

  async preparePayRunItem(item: PayRunItemPreview): Promise<PayRunItemPreview> {
    if (isArcDomain(item.destinationChainId)) {
      return {
        ...item,
        maxFeeBaseUnits: 0,
        minFinalityThreshold: CCTP_SLOW_FINALITY_THRESHOLD,
        useForwarder: false,
      };
    }

    const route = getCctpRouteByDomain(item.destinationChainId);
    if (!route) {
      throw new Error(`Unsupported CCTP destination domain ${item.destinationChainId}.`);
    }

    if (this.config.chainMode !== "live") {
      return {
        ...item,
        maxFeeBaseUnits: 0,
        minFinalityThreshold: CCTP_SLOW_FINALITY_THRESHOLD,
        useForwarder: route.forwarderSupported,
      };
    }

    const useForwarder = route.forwarderSupported;
    const maxFeeBaseUnits = useForwarder
      ? Number(
          await fetchForwardingFee(
            ARC_TESTNET_CCTP_DOMAIN,
            route.domain,
            route.isTestnet,
            CCTP_SLOW_FINALITY_THRESHOLD,
          ),
        )
      : 0;

    return {
      ...item,
      maxFeeBaseUnits,
      minFinalityThreshold: CCTP_SLOW_FINALITY_THRESHOLD,
      useForwarder,
    };
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
    if (this.config.chainMode !== "live") {
      return onChainId;
    }

    const { walletClient, publicClient, liveChain } = this.requireLiveClients();
    const recipients = input.items.map((item) => item.recipientWalletAddress as `0x${string}`);
    const amounts = input.items.map((item) => toUsdcBaseUnits(item.amountCents));
    const destinationDomains = input.items.map((item) => item.destinationChainId);
    const maxFees = input.items.map((item) => BigInt(item.maxFeeBaseUnits));
    const minFinalityThresholds = input.items.map((item) => item.minFinalityThreshold);
    const useForwarders = input.items.map((item) => item.useForwarder);
    const [periodStartYear, periodStartMonth, periodStartDay] = input.payRun.periodStart.split("-").map(Number);
    const [periodEndYear, periodEndMonth, periodEndDay] = input.payRun.periodEnd.split("-").map(Number);
    const periodStart = BigInt(Math.floor(Date.UTC(periodStartYear, periodStartMonth - 1, periodStartDay) / 1000));
    const periodEnd = BigInt(Math.floor(Date.UTC(periodEndYear, periodEndMonth - 1, periodEndDay) / 1000));

    const hash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "createPayRun",
      args: [
        onChainId,
        periodStart,
        periodEnd,
        recipients,
        amounts,
        destinationDomains,
        maxFees,
        minFinalityThresholds,
        useForwarders,
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return onChainId;
  }

  private extractCrossChainMessages(
    items: PayRunItemRecord[],
    logs: ReadonlyArray<Record<string, unknown>>,
  ) {
    const parsed = parseEventLogs({
      abi: this.tokenMessengerEventAbi,
      eventName: "DepositForBurn",
      logs: logs as Parameters<typeof parseEventLogs>[0]["logs"],
      strict: false,
    });
    const used = new Set<number>();
    const crossChainItems = items.filter((item) => !isArcDomain(item.destinationChainId));

    return crossChainItems.map((item) => {
      const matchIndex = parsed.findIndex((log, index) => {
        if (used.has(index)) return false;
        const args = log.args as {
          amount?: bigint;
          destinationDomain?: number;
          mintRecipient?: `0x${string}`;
          minFinalityThreshold?: bigint;
        };
        return (
          args.amount === toUsdcBaseUnits(item.amountCents) &&
          args.destinationDomain === item.destinationChainId &&
          args.mintRecipient?.toLowerCase() === bytes32FromAddress(item.recipientWalletAddress).toLowerCase() &&
          Number(args.minFinalityThreshold ?? 0n) === item.minFinalityThreshold
        );
      });

      if (matchIndex === -1) {
        return {
          itemId: item.id,
          nonce: null,
        };
      }

      used.add(matchIndex);
      const args = parsed[matchIndex]?.args as { nonce?: bigint } | undefined;
      return {
        itemId: item.id,
        nonce: args?.nonce != null ? String(args.nonce) : null,
      };
    });
  }

  async executePayRun(payRun: PayRunRecord, items: PayRunItemRecord[]): Promise<ChainExecutePayRunResult> {
    const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
    if (this.config.chainMode !== "live") {
      return {
        onChainId,
        txHash: createMockHash(`execute-${payRun.id}`),
        crossChainMessages: items
          .filter((item) => !isArcDomain(item.destinationChainId))
          .map((item, index) => ({
            itemId: item.id,
            nonce: String(index + 1),
          })),
      };
    }

    const { walletClient, publicClient, liveChain } = this.requireLiveClients();
    const txHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "executePayRun",
      args: [onChainId as `0x${string}`],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      onChainId,
      txHash,
      crossChainMessages: this.extractCrossChainMessages(items, receipt.logs),
    };
  }

  async finalizePayRun(payRun: PayRunRecord, items: PayRunItemRecord[]): Promise<ChainFinalizePayRunResult> {
    if (this.config.chainMode !== "live") {
      return {
        status: "executed",
        txHash: createMockHash(`finalize-${payRun.id}`),
        itemUpdates: items
          .filter((item) => item.status !== "paid")
          .map((item) => ({ itemId: item.id, status: "paid" as const, txHash: item.txHash })),
      };
    }

    const processingItems = items.filter((item) => item.status === "processing");
    if (processingItems.length === 0) {
      return {
        status: "executed",
        txHash: payRun.txHash,
        itemUpdates: [],
      };
    }
    if (!payRun.txHash) {
      throw new Error("Cannot finalize a cross-chain pay run without a source Arc transaction hash.");
    }

    const attestationResponse = await fetchAttestationMessages(ARC_TESTNET_CCTP_DOMAIN, payRun.txHash, true);
    const byNonce = new Map(attestationResponse.messages.map((message) => [String(message.eventNonce), message]));
    const itemUpdates: ChainFinalizePayRunResult["itemUpdates"] = [];
    const usedMessageNonces = new Set<string>();

    for (const item of processingItems) {
      const message =
        (item.bridgeNonce ? byNonce.get(item.bridgeNonce) : undefined) ??
        attestationResponse.messages.find((candidate) => {
          const nonce = String(candidate.eventNonce ?? "");
          if (!nonce || usedMessageNonces.has(nonce)) return false;
          return this.attestationMatchesItem(candidate, item);
        });
      if (!message) {
        itemUpdates.push({ itemId: item.id, status: "processing", txHash: item.txHash });
        continue;
      }
      if (message.eventNonce) {
        usedMessageNonces.add(String(message.eventNonce));
      }

      if (item.useForwarder) {
        const state = (message.forwardState ?? "").toUpperCase();
        if ((state === "CONFIRMED" || state === "COMPLETE") && message.forwardTxHash) {
          itemUpdates.push({ itemId: item.id, status: "paid", txHash: message.forwardTxHash });
          continue;
        }
        if (state === "FAILED") {
          itemUpdates.push({ itemId: item.id, status: "failed", txHash: null });
          continue;
        }
        try {
          const destinationTxHash = await this.submitDestinationMint(item, message);
          if (destinationTxHash) {
            itemUpdates.push({ itemId: item.id, status: "paid", txHash: destinationTxHash });
            continue;
          }
        } catch {
          itemUpdates.push({ itemId: item.id, status: "processing", txHash: item.txHash });
          continue;
        }
      }

      const destinationTxHash = await this.submitDestinationMint(item, message);
      if (!destinationTxHash) {
        itemUpdates.push({ itemId: item.id, status: "processing", txHash: item.txHash });
        continue;
      }
      itemUpdates.push({ itemId: item.id, status: "paid", txHash: destinationTxHash });
    }

    if (itemUpdates.some((item) => item.status === "failed")) {
      const failedTxHash = await this.markPayRunFailed(payRun);
      return {
        status: "failed",
        txHash: failedTxHash,
        itemUpdates,
      };
    }

    if (itemUpdates.some((item) => item.status === "processing")) {
      return {
        status: "processing",
        txHash: payRun.txHash,
        itemUpdates,
      };
    }

    const finalizationTxHash = await this.finalizeArcPayRun(payRun);
    return {
      status: "executed",
      txHash: finalizationTxHash,
      itemUpdates,
    };
  }

  private async finalizeArcPayRun(payRun: PayRunRecord) {
    const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
    const { walletClient, publicClient, liveChain } = this.requireLiveClients();
    const txHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "finalizePayRun",
      args: [onChainId as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  private async markPayRunFailed(payRun: PayRunRecord) {
    const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
    const { walletClient, publicClient, liveChain } = this.requireLiveClients();
    const txHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.payRunAddress,
      abi: this.payRunAbi,
      functionName: "markFailed",
      args: [onChainId as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  private async submitDestinationMint(item: PayRunItemRecord, message: AttestationMessagePayload) {
    if (message.status !== "complete" || !message.message || !message.attestation) {
      return null;
    }

    const { route, publicClient, walletClient } = this.destinationClients(item.destinationChainId);
    const destinationTxHash = await walletClient.writeContract({
      chain: undefined,
      address: route.messageTransmitterV2,
      abi: this.messageTransmitterAbi,
      functionName: "receiveMessage",
      args: [message.message as `0x${string}`, message.attestation as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash: destinationTxHash });
    return destinationTxHash;
  }

  private attestationMatchesItem(message: AttestationMessagePayload, item: PayRunItemRecord) {
    const decodedMessage = (message.decodedMessage ?? {}) as {
      destinationDomain?: string | number;
      decodedMessageBody?: Record<string, unknown>;
    };
    const decodedBody = (decodedMessage.decodedMessageBody ?? {}) as {
      mintRecipient?: string;
      amount?: string | number;
    };

    return (
      Number(decodedMessage.destinationDomain ?? Number.NaN) === item.destinationChainId &&
      decodedBody.mintRecipient?.toLowerCase() === item.recipientWalletAddress.toLowerCase() &&
      String(decodedBody.amount ?? "") === toUsdcBaseUnits(item.amountCents).toString()
    );
  }

  async transferPayroll(recipient: `0x${string}`, amountCents: number) {
    if (this.config.chainMode !== "live") {
      return createMockHash(`withdraw-${recipient}-${amountCents}`);
    }

    const { walletClient, publicClient, liveChain } = this.requireLiveClients();
    const txHash = await walletClient.writeContract({
      chain: undefined,
      address: liveChain.coreAddress,
      abi: this.coreAbi,
      functionName: "transferPayroll",
      args: [recipient, toUsdcBaseUnits(amountCents)],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  async rebalanceUsdcToUsyc(amountCents: number) {
    if (this.config.chainMode !== "live") {
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
    if (this.config.chainMode !== "live") {
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
