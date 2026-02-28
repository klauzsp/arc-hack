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
    account;
    walletClient;
    publicClient;
    coreAbi = (0, viem_1.parseAbi)([
        "function treasuryBalance() view returns (uint256)",
        "function withdraw(address to, uint256 amount)",
    ]);
    payRunAbi = (0, viem_1.parseAbi)([
        "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] chainIds) returns (uint256)",
        "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
        "function finalizePayRun(bytes32 payRunId)",
    ]);
    tellerAbi = (0, viem_1.parseAbi)([
        "function deposit(uint256 assets, address receiver) returns (uint256)",
        "function redeem(uint256 shares, address receiver, address account) returns (uint256)",
    ]);
    erc20Abi = (0, viem_1.parseAbi)([
        "function balanceOf(address account) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transfer(address to, uint256 amount) returns (bool)",
    ]);
    constructor(config) {
        this.config = config;
        this.account =
            this.config.chainMode === "live" && this.config.liveChain
                ? (0, accounts_1.privateKeyToAccount)(this.config.liveChain.privateKey)
                : null;
        this.walletClient = this.createWalletClient();
        this.publicClient = this.createPublicClient();
    }
    createWalletClient() {
        if (this.config.chainMode !== "live" || !this.config.liveChain || !this.account)
            return null;
        return (0, viem_1.createWalletClient)({
            account: this.account,
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
    requireLiveClients() {
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
    createOnChainPayRunId(payRunId) {
        return (0, viem_1.keccak256)((0, viem_1.stringToHex)(payRunId));
    }
    async getTreasurySnapshot() {
        if (this.config.chainMode !== "live")
            return null;
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
    async finalizePayRun(payRun) {
        const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
        if (this.config.chainMode !== "live" || !this.walletClient || !this.config.liveChain) {
            return createMockHash(`finalize-${payRun.id}`);
        }
        const txHash = await this.walletClient.writeContract({
            chain: undefined,
            address: this.config.liveChain.payRunAddress,
            abi: this.payRunAbi,
            functionName: "finalizePayRun",
            args: [onChainId],
        });
        await this.publicClient?.waitForTransactionReceipt({ hash: txHash });
        return txHash;
    }
    async rebalanceUsdcToUsyc(amountCents) {
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
    async rebalanceUsycToUsdc(amountCents) {
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
exports.ChainService = ChainService;
