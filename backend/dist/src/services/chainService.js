"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainService = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
function toUsdcBaseUnits(cents) {
    return BigInt(cents) * 10000n;
}
function createMockHash(seed) {
    return `0x${seed.replace(/[^a-z0-9]/gi, "").padEnd(64, "a").slice(0, 64)}`;
}
class ChainService {
    config;
    walletClient;
    publicClient;
    payRunAbi = (0, viem_1.parseAbi)([
        "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] chainIds) returns (uint256)",
        "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
    ]);
    rebalanceAbi = (0, viem_1.parseAbi)([
        "function usdcToUsyc(uint256 amount, address receiver) returns (uint256)",
        "function usycToUsdc(uint256 shares, address receiver) returns (uint256)",
    ]);
    constructor(config) {
        this.config = config;
        this.walletClient = this.createWalletClient();
        this.publicClient = this.createPublicClient();
    }
    createWalletClient() {
        if (this.config.chainMode !== "live" || !this.config.liveChain)
            return null;
        const account = (0, accounts_1.privateKeyToAccount)(this.config.liveChain.privateKey);
        return (0, viem_1.createWalletClient)({
            account,
            transport: (0, viem_1.http)(this.config.liveChain.rpcUrl),
        });
    }
    createPublicClient() {
        if (this.config.chainMode !== "live" || !this.config.liveChain)
            return null;
        return (0, viem_1.createPublicClient)({
            transport: (0, viem_1.http)(this.config.liveChain.rpcUrl),
        });
    }
    createOnChainPayRunId(payRunId) {
        return (0, viem_1.keccak256)((0, viem_1.stringToHex)(payRunId));
    }
    async createPayRun(input) {
        const onChainId = this.createOnChainPayRunId(input.payRun.id);
        if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
            return onChainId;
        }
        const recipients = input.items.map((item) => item.recipientWalletAddress);
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
    async executePayRun(payRun) {
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
            args: [onChainId],
        });
        await this.publicClient?.waitForTransactionReceipt({ hash: txHash });
        return { onChainId, txHash };
    }
    async rebalanceUsdcToUsyc(amountCents) {
        if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
            return createMockHash(`usdc-to-usyc-${amountCents}`);
        }
        const txHash = await this.walletClient.writeContract({
            chain: undefined,
            address: this.config.liveChain.rebalanceAddress,
            abi: this.rebalanceAbi,
            functionName: "usdcToUsyc",
            args: [toUsdcBaseUnits(amountCents), this.config.liveChain.rebalanceAddress],
        });
        await this.publicClient?.waitForTransactionReceipt({ hash: txHash });
        return txHash;
    }
    async rebalanceUsycToUsdc(amountCents) {
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
exports.ChainService = ChainService;
