import { randomUUID } from "node:crypto";
import { createPublicClient, http, parseAbi } from "viem";
import type { AppConfig } from "../config";

type CircleResponse<T> = {
  data?: T;
};

type CircleUser = {
  id?: string;
  userId?: string;
};

type CircleUserToken = {
  userToken?: string;
  encryptionKey?: string;
};

type CircleSocialDeviceToken = {
  deviceToken?: string;
  userToken?: string;
  deviceEncryptionKey?: string;
  encryptionKey?: string;
};

type CircleInitializeData = {
  challengeId?: string;
};

type CircleTransferChallengeData = {
  challengeId?: string;
};

type CircleWallet = {
  id?: string;
  address?: string;
  blockchain?: string;
  state?: string;
};

export class CircleWalletService {
  private readonly erc20Abi = parseAbi([
    "function allowance(address owner, address spender) view returns (uint256)",
  ]);

  constructor(private readonly config: AppConfig) {}

  isConfigured() {
    return Boolean(this.config.circle?.apiKey && this.config.circle?.appId);
  }

  getAppId() {
    return this.config.circle?.appId ?? null;
  }

  private requireConfig() {
    if (!this.config.circle) {
      throw new Error("Circle user-controlled wallets are not configured.");
    }
    return this.config.circle;
  }

  private getUsdcTokenAddress() {
    return (this.config.liveChain?.usdcAddress ?? "0x3600000000000000000000000000000000000000").toLowerCase();
  }

  async getUsdcAllowance(owner: string, spender: string) {
    if (this.config.chainMode !== "live" || !this.config.liveChain) {
      throw new Error("Live chain configuration is required to read Circle wallet allowances.");
    }

    const client = createPublicClient({
      transport: http(this.config.liveChain.rpcUrl),
    });

    return client.readContract({
      address: this.config.liveChain.usdcAddress,
      abi: this.erc20Abi,
      functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });
  }

  private async circleFetch<T>(
    path: string,
    init: RequestInit,
    options?: { userToken?: string },
  ) {
    const circle = this.requireConfig();
    const requestId = randomUUID();
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

    const body = (await response.json().catch(() => ({}))) as CircleResponse<T> & {
      message?: string;
      errors?: Array<{ error?: string; message?: string }>;
    };

    if (!response.ok) {
      const firstError = body.errors?.[0];
      throw new Error(firstError?.message || firstError?.error || body.message || "Circle API request failed.");
    }

    return body.data as T;
  }

  private async ensureUser(employeeId: string) {
    const circle = this.requireConfig();
    const userId = `arc-payroll-${employeeId}`.slice(0, 50);

    try {
      await this.circleFetch<CircleUser>("/v1/w3s/users", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: randomUUID(),
          userId,
        }),
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("already")) {
        throw error;
      }
    }

    return {
      userId,
      walletBlockchain: circle.walletBlockchain,
    };
  }

  async createUserToken(employeeId: string) {
    const { userId } = await this.ensureUser(employeeId);
    const token = await this.circleFetch<CircleUserToken>("/v1/w3s/users/token", {
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

  async createSocialDeviceToken(deviceId: string) {
    const token = await this.circleFetch<CircleSocialDeviceToken>("/v1/w3s/users/social/token", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
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

  async listWallets(userToken: string) {
    const data = await this.circleFetch<{ wallets?: CircleWallet[] }>("/v1/w3s/wallets", {
      method: "GET",
    }, { userToken });
    return data.wallets ?? [];
  }

  async startArcWalletProvisioning(employeeId: string, userToken: string) {
    const circle = this.requireConfig();
    const existingWallet = await this.getArcWallet(userToken);
    if (existingWallet) {
      return {
        challengeId: null,
        wallet: existingWallet,
      };
    }

    const result = await this.circleFetch<CircleInitializeData>("/v1/w3s/user/initialize", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
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

  async getArcWallet(userToken: string) {
    const circle = this.requireConfig();
    const wallets = await this.listWallets(userToken);
    return wallets.find((wallet) => wallet.blockchain === circle.walletBlockchain && wallet.address) ?? null;
  }

  async createTransferChallenge(input: {
    userToken: string;
    walletId: string;
    destinationAddress: string;
    amount: string;
    refId?: string;
  }) {
    const circle = this.requireConfig();
    const result = await this.circleFetch<CircleTransferChallengeData>("/v1/w3s/user/transactions/transfer", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
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

  async createContractExecutionChallenge(input: {
    userToken: string;
    walletId: string;
    contractAddress: string;
    callData: string;
    refId?: string;
  }) {
    const result = await this.circleFetch<CircleTransferChallengeData>("/v1/w3s/user/transactions/contractExecution", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
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
