import { randomUUID } from "node:crypto";
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

type CircleInitializeData = {
  challengeId?: string;
};

type CircleWallet = {
  id?: string;
  address?: string;
  blockchain?: string;
  state?: string;
};

export class CircleWalletService {
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

  private async circleFetch<T>(
    path: string,
    init: RequestInit,
    options?: { userToken?: string },
  ) {
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
        metadata: [{ name: "employeeId", value: employeeId }],
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
}
