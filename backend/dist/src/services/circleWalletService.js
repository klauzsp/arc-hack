"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircleWalletService = void 0;
const node_crypto_1 = require("node:crypto");
const viem_1 = require("viem");
class CircleWalletService {
    config;
    erc20Abi = (0, viem_1.parseAbi)([
        "function allowance(address owner, address spender) view returns (uint256)",
    ]);
    constructor(config) {
        this.config = config;
    }
    isConfigured() {
        return Boolean(this.config.circle?.apiKey && this.config.circle?.appId);
    }
    getAppId() {
        return this.config.circle?.appId ?? null;
    }
    requireConfig() {
        if (!this.config.circle) {
            throw new Error("Circle user-controlled wallets are not configured.");
        }
        return this.config.circle;
    }
    getUsdcTokenAddress() {
        return (this.config.liveChain?.usdcAddress ?? "0x3600000000000000000000000000000000000000").toLowerCase();
    }
    async getUsdcAllowance(owner, spender) {
        if (this.config.chainMode !== "live" || !this.config.liveChain) {
            throw new Error("Live chain configuration is required to read Circle wallet allowances.");
        }
        const client = (0, viem_1.createPublicClient)({
            transport: (0, viem_1.http)(this.config.liveChain.rpcUrl),
        });
        return client.readContract({
            address: this.config.liveChain.usdcAddress,
            abi: this.erc20Abi,
            functionName: "allowance",
            args: [owner, spender],
        });
    }
    async circleFetch(path, init, options) {
        const circle = this.requireConfig();
        const requestId = (0, node_crypto_1.randomUUID)();
        const response = await fetch(`${circle.apiBaseUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${circle.apiKey}`,
                "Content-Type": "application/json",
                "X-Request-Id": requestId,
                ...(options?.userToken ? { "X-User-Token": options.userToken } : {}),
                ...(init.headers ?? {}),
            },
        });
        const body = (await response.json().catch(() => ({})));
        if (!response.ok) {
            const firstError = body.errors?.[0];
            throw new Error(firstError?.message || firstError?.error || body.message || "Circle API request failed.");
        }
        return body.data;
    }
    async ensureUser(employeeId) {
        const circle = this.requireConfig();
        const userId = `arc-payroll-${employeeId}`.slice(0, 50);
        try {
            await this.circleFetch("/v1/w3s/users", {
                method: "POST",
                body: JSON.stringify({
                    idempotencyKey: (0, node_crypto_1.randomUUID)(),
                    userId,
                }),
            });
        }
        catch (error) {
            if (!(error instanceof Error) || !error.message.toLowerCase().includes("already")) {
                throw error;
            }
        }
        return {
            userId,
            walletBlockchain: circle.walletBlockchain,
        };
    }
    async createUserToken(employeeId) {
        const { userId } = await this.ensureUser(employeeId);
        const token = await this.circleFetch("/v1/w3s/users/token", {
            method: "POST",
            body: JSON.stringify({
                userId,
            }),
        });
        if (!token.userToken || !token.encryptionKey) {
            throw new Error("Circle did not return a usable user token.");
        }
        return {
            userId,
            userToken: token.userToken,
            encryptionKey: token.encryptionKey,
            appId: this.requireConfig().appId,
        };
    }
    async createSocialDeviceToken(deviceId) {
        const token = await this.circleFetch("/v1/w3s/users/social/token", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: (0, node_crypto_1.randomUUID)(),
                deviceId,
            }),
        });
        const deviceToken = token.deviceToken ?? token.userToken;
        const deviceEncryptionKey = token.deviceEncryptionKey ?? token.encryptionKey;
        if (!deviceToken || !deviceEncryptionKey) {
            throw new Error("Circle did not return a usable social login device token.");
        }
        return {
            deviceToken,
            deviceEncryptionKey,
            appId: this.requireConfig().appId,
        };
    }
    async listWallets(userToken) {
        const data = await this.circleFetch("/v1/w3s/wallets", {
            method: "GET",
        }, { userToken });
        return data.wallets ?? [];
    }
    async startArcWalletProvisioning(employeeId, userToken) {
        const circle = this.requireConfig();
        const existingWallet = await this.getArcWallet(userToken);
        if (existingWallet) {
            return {
                challengeId: null,
                wallet: existingWallet,
            };
        }
        const result = await this.circleFetch("/v1/w3s/user/initialize", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: (0, node_crypto_1.randomUUID)(),
                accountType: circle.accountType,
                blockchains: [circle.walletBlockchain],
                metadata: [{ name: "employeeId", refId: employeeId }],
            }),
        }, { userToken });
        return {
            challengeId: result.challengeId ?? null,
            wallet: null,
        };
    }
    async getArcWallet(userToken) {
        const circle = this.requireConfig();
        const wallets = await this.listWallets(userToken);
        return wallets.find((wallet) => wallet.blockchain === circle.walletBlockchain && wallet.address) ?? null;
    }
    async createTransferChallenge(input) {
        const circle = this.requireConfig();
        const result = await this.circleFetch("/v1/w3s/user/transactions/transfer", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: (0, node_crypto_1.randomUUID)(),
                walletId: input.walletId,
                destinationAddress: input.destinationAddress,
                amounts: [input.amount],
                blockchain: circle.walletBlockchain,
                tokenAddress: this.getUsdcTokenAddress(),
                feeLevel: "MEDIUM",
                ...(input.refId ? { refId: input.refId } : {}),
            }),
        }, { userToken: input.userToken });
        if (!result.challengeId) {
            throw new Error("Circle did not return a transfer challenge.");
        }
        return {
            challengeId: result.challengeId,
            blockchain: circle.walletBlockchain,
            tokenAddress: this.getUsdcTokenAddress(),
            symbol: "USDC",
        };
    }
    async createContractExecutionChallenge(input) {
        const result = await this.circleFetch("/v1/w3s/user/transactions/contractExecution", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: (0, node_crypto_1.randomUUID)(),
                walletId: input.walletId,
                contractAddress: input.contractAddress,
                callData: input.callData,
                feeLevel: "MEDIUM",
                ...(input.refId ? { refId: input.refId } : {}),
            }),
        }, { userToken: input.userToken });
        if (!result.challengeId) {
            throw new Error("Circle did not return a contract execution challenge.");
        }
        return {
            challengeId: result.challengeId,
        };
    }
}
exports.CircleWalletService = CircleWalletService;
