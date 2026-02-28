"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainService = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const cctp_1 = require("../lib/cctp");
function toUsdcBaseUnits(cents) {
    return BigInt(cents) * 10000n;
}
function bytes32FromAddress(address) {
    return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
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
        "function transferPayroll(address recipient, uint256 amount)",
    ]);
    payRunAbi = (0, viem_1.parseAbi)([
        "function createPayRun(bytes32 payRunId, uint64 periodStart, uint64 periodEnd, address[] recipients, uint256[] amounts, uint32[] destinationDomains, uint256[] maxFees, uint32[] minFinalityThresholds, bool[] useForwarders) returns (uint256)",
        "function executePayRun(bytes32 payRunId) returns (uint256 arcPayoutAmount, uint256 crossChainItemCount)",
        "function finalizePayRun(bytes32 payRunId)",
        "function markFailed(bytes32 payRunId)",
    ]);
    cctpBridgeAbi = (0, viem_1.parseAbi)([
        "function bridgePayroll(address recipient, uint256 amount, uint32 destinationDomain, uint256 maxFee, uint32 minFinalityThreshold, bool useForwarder)",
    ]);
    tokenMessengerEventAbi = (0, viem_1.parseAbi)([
        "event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint256 minFinalityThreshold, bytes hookData)",
    ]);
    messageTransmitterAbi = (0, viem_1.parseAbi)([
        "function receiveMessage(bytes message, bytes attestation) returns (bool)",
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
    destinationClients(destinationDomain) {
        const route = (0, cctp_1.getCctpRouteByDomain)(destinationDomain);
        if (!route) {
            throw new Error(`Unsupported CCTP destination domain ${destinationDomain}.`);
        }
        if (!this.account) {
            throw new Error("Live chain client is not configured.");
        }
        return {
            route,
            publicClient: (0, viem_1.createPublicClient)({
                transport: (0, viem_1.http)(route.rpcUrl),
            }),
            walletClient: (0, viem_1.createWalletClient)({
                account: this.account,
                transport: (0, viem_1.http)(route.rpcUrl),
            }),
        };
    }
    createOnChainPayRunId(payRunId) {
        return (0, viem_1.keccak256)((0, viem_1.stringToHex)(payRunId));
    }
    async preparePayRunItem(item) {
        if ((0, cctp_1.isArcDomain)(item.destinationChainId)) {
            return {
                ...item,
                maxFeeBaseUnits: 0,
                minFinalityThreshold: cctp_1.CCTP_SLOW_FINALITY_THRESHOLD,
                useForwarder: false,
            };
        }
        const route = (0, cctp_1.getCctpRouteByDomain)(item.destinationChainId);
        if (!route) {
            throw new Error(`Unsupported CCTP destination domain ${item.destinationChainId}.`);
        }
        if (this.config.chainMode !== "live") {
            return {
                ...item,
                maxFeeBaseUnits: 0,
                minFinalityThreshold: cctp_1.CCTP_SLOW_FINALITY_THRESHOLD,
                useForwarder: route.forwarderSupported,
            };
        }
        const useForwarder = route.forwarderSupported;
        const maxFeeBaseUnits = useForwarder
            ? Number(await (0, cctp_1.fetchForwardingFee)(cctp_1.ARC_TESTNET_CCTP_DOMAIN, route.domain, route.isTestnet, cctp_1.CCTP_SLOW_FINALITY_THRESHOLD))
            : 0;
        return {
            ...item,
            maxFeeBaseUnits,
            minFinalityThreshold: cctp_1.CCTP_SLOW_FINALITY_THRESHOLD,
            useForwarder,
        };
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
        if (this.config.chainMode !== "live") {
            return onChainId;
        }
        const { walletClient, publicClient, liveChain } = this.requireLiveClients();
        const recipients = input.items.map((item) => item.recipientWalletAddress);
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
    extractCrossChainMessages(items, logs) {
        const parsed = (0, viem_1.parseEventLogs)({
            abi: this.tokenMessengerEventAbi,
            eventName: "DepositForBurn",
            logs: logs,
            strict: false,
        });
        const used = new Set();
        const crossChainItems = items.filter((item) => !(0, cctp_1.isArcDomain)(item.destinationChainId));
        return crossChainItems.map((item) => {
            const matchIndex = parsed.findIndex((log, index) => {
                if (used.has(index))
                    return false;
                const args = log.args;
                return (args.amount === toUsdcBaseUnits(item.amountCents) &&
                    args.destinationDomain === item.destinationChainId &&
                    args.mintRecipient?.toLowerCase() === bytes32FromAddress(item.recipientWalletAddress).toLowerCase() &&
                    Number(args.minFinalityThreshold ?? 0n) === item.minFinalityThreshold);
            });
            if (matchIndex === -1) {
                return {
                    itemId: item.id,
                    nonce: null,
                };
            }
            used.add(matchIndex);
            const args = parsed[matchIndex]?.args;
            return {
                itemId: item.id,
                nonce: args?.nonce != null ? String(args.nonce) : null,
            };
        });
    }
    async executePayRun(payRun, items) {
        const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
        if (this.config.chainMode !== "live") {
            return {
                onChainId,
                txHash: createMockHash(`execute-${payRun.id}`),
                crossChainMessages: items
                    .filter((item) => !(0, cctp_1.isArcDomain)(item.destinationChainId))
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
            args: [onChainId],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return {
            onChainId,
            txHash,
            crossChainMessages: this.extractCrossChainMessages(items, receipt.logs),
        };
    }
    async finalizePayRun(payRun, items) {
        if (this.config.chainMode !== "live") {
            return {
                status: "executed",
                txHash: createMockHash(`finalize-${payRun.id}`),
                itemUpdates: items
                    .filter((item) => item.status !== "paid")
                    .map((item) => ({ itemId: item.id, status: "paid", txHash: item.txHash })),
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
        const attestationResponse = await (0, cctp_1.fetchAttestationMessages)(cctp_1.ARC_TESTNET_CCTP_DOMAIN, payRun.txHash, true);
        const byNonce = new Map(attestationResponse.messages.map((message) => [String(message.eventNonce), message]));
        const itemUpdates = [];
        const usedMessageNonces = new Set();
        for (const item of processingItems) {
            const message = (item.bridgeNonce ? byNonce.get(item.bridgeNonce) : undefined) ??
                attestationResponse.messages.find((candidate) => {
                    const nonce = String(candidate.eventNonce ?? "");
                    if (!nonce || usedMessageNonces.has(nonce))
                        return false;
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
                }
                catch {
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
    async finalizeArcPayRun(payRun) {
        const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
        const { walletClient, publicClient, liveChain } = this.requireLiveClients();
        const txHash = await walletClient.writeContract({
            chain: undefined,
            address: liveChain.payRunAddress,
            abi: this.payRunAbi,
            functionName: "finalizePayRun",
            args: [onChainId],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return txHash;
    }
    async markPayRunFailed(payRun) {
        const onChainId = payRun.onChainId ?? this.createOnChainPayRunId(payRun.id);
        const { walletClient, publicClient, liveChain } = this.requireLiveClients();
        const txHash = await walletClient.writeContract({
            chain: undefined,
            address: liveChain.payRunAddress,
            abi: this.payRunAbi,
            functionName: "markFailed",
            args: [onChainId],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return txHash;
    }
    async submitDestinationMint(item, message) {
        if (message.status !== "complete" || !message.message || !message.attestation) {
            return null;
        }
        const { route, publicClient, walletClient } = this.destinationClients(item.destinationChainId);
        const destinationTxHash = await walletClient.writeContract({
            chain: undefined,
            address: route.messageTransmitterV2,
            abi: this.messageTransmitterAbi,
            functionName: "receiveMessage",
            args: [message.message, message.attestation],
        });
        await publicClient.waitForTransactionReceipt({ hash: destinationTxHash });
        return destinationTxHash;
    }
    attestationMatchesItem(message, item) {
        const decodedMessage = (message.decodedMessage ?? {});
        const decodedBody = (decodedMessage.decodedMessageBody ?? {});
        return (Number(decodedMessage.destinationDomain ?? Number.NaN) === item.destinationChainId &&
            decodedBody.mintRecipient?.toLowerCase() === item.recipientWalletAddress.toLowerCase() &&
            String(decodedBody.amount ?? "") === toUsdcBaseUnits(item.amountCents).toString());
    }
    async transferPayroll(item) {
        if (this.config.chainMode !== "live") {
            return {
                txHash: createMockHash(`withdraw-${item.recipientWalletAddress}-${item.amountCents}-${item.destinationChainId}`),
                status: (0, cctp_1.isArcDomain)(item.destinationChainId) ? "paid" : "processing",
            };
        }
        const { walletClient, publicClient, liveChain } = this.requireLiveClients();
        let txHash;
        if ((0, cctp_1.isArcDomain)(item.destinationChainId)) {
            txHash = await walletClient.writeContract({
                chain: undefined,
                address: liveChain.coreAddress,
                abi: this.coreAbi,
                functionName: "transferPayroll",
                args: [item.recipientWalletAddress, toUsdcBaseUnits(item.amountCents)],
            });
            await publicClient.waitForTransactionReceipt({ hash: txHash });
            return {
                txHash,
                status: "paid",
            };
        }
        if (!liveChain.cctpBridgeAddress) {
            throw new Error("BACKEND_CCTP_BRIDGE_ADDRESS is required for cross-chain payroll withdrawals.");
        }
        txHash = await walletClient.writeContract({
            chain: undefined,
            address: liveChain.cctpBridgeAddress,
            abi: this.cctpBridgeAbi,
            functionName: "bridgePayroll",
            args: [
                item.recipientWalletAddress,
                toUsdcBaseUnits(item.amountCents),
                item.destinationChainId,
                BigInt(item.maxFeeBaseUnits),
                item.minFinalityThreshold,
                item.useForwarder,
            ],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return {
            txHash,
            status: "processing",
        };
    }
    async rebalanceUsdcToUsyc(amountCents) {
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
    async rebalanceUsycToUsdc(amountCents) {
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
exports.ChainService = ChainService;
