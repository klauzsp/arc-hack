"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircleWalletService = void 0;
const node_crypto_1 = require("node:crypto");
class CircleWalletService {
    config;
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
    async circleFetch(path, init, options) {
        const circle = this.requireConfig();
        const response = await fetch(`${circle.apiBaseUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${circle.apiKey}`,
                "Content-Type": "application/json",
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
                metadata: [{ name: "employeeId", value: employeeId }],
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
}
exports.CircleWalletService = CircleWalletService;
