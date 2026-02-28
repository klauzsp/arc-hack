import { recoverMessageAddress } from "viem";
import type { AppConfig } from "../config";
import { createToken } from "../lib/ids";
import { PayrollRepository } from "../repository";
import type { EmployeeRecord, Role, SessionRecord } from "../domain/types";

export class AuthService {
  constructor(
    private readonly repository: PayrollRepository,
    private readonly config: AppConfig,
  ) {}

  async issueChallenge(address: string, nowIso: string) {
    const normalizedAddress = address.toLowerCase();
    const nonce = createToken(12);
    const expiresAt = new Date(Date.parse(nowIso) + 5 * 60 * 1000).toISOString();
    const message = [
      `${this.config.companyName} Sign-In`,
      `Address: ${normalizedAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${nowIso}`,
      "Purpose: authenticate for Arc payroll backend access.",
    ].join("\n");

    return this.repository.storeChallenge({
      address: normalizedAddress,
      nonce,
      message,
      expiresAt,
    });
  }

  private resolveRole(address: string, employee: EmployeeRecord | null): Role {
    if (address.toLowerCase() === this.config.adminWallet) return "admin";
    if (employee) return "employee";
    return null;
  }

  async verifyChallenge(input: {
    address: string;
    message: string;
    signature: `0x${string}`;
    nowIso: string;
  }) {
    const normalizedAddress = input.address.toLowerCase();
    const challenge = this.repository.getChallenge(normalizedAddress);
    if (!challenge) {
      throw new Error("Challenge not found or expired.");
    }
    if (challenge.expiresAt <= input.nowIso) {
      this.repository.deleteChallenge(normalizedAddress);
      throw new Error("Challenge expired.");
    }
    if (challenge.message !== input.message) {
      throw new Error("Challenge message mismatch.");
    }

    const recoveredAddress = (await recoverMessageAddress({
      message: input.message,
      signature: input.signature,
    })).toLowerCase();

    if (recoveredAddress !== normalizedAddress) {
      throw new Error("Signature does not match the requested address.");
    }

    const employee = this.repository.getEmployeeByWallet(normalizedAddress);
    const role = this.resolveRole(normalizedAddress, employee);
    this.repository.deleteChallenge(normalizedAddress);

    if (!role) {
      return {
        token: null,
        role: null,
        employee: null,
      };
    }

    const token = createToken(32);
    const expiresAt = new Date(Date.parse(input.nowIso) + this.config.sessionTtlHours * 60 * 60 * 1000).toISOString();
    const session: SessionRecord = {
      token,
      address: normalizedAddress,
      role,
      employeeId: employee?.id ?? null,
      expiresAt,
    };
    this.repository.createSession(session);

    return {
      token,
      role,
      employee,
    };
  }

  getSession(token: string, nowIso: string) {
    this.repository.purgeExpiredSessions(nowIso);
    const session = this.repository.getSession(token);
    if (!session || session.expiresAt <= nowIso) return null;
    return session;
  }
}
