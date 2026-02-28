"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const viem_1 = require("viem");
const ids_1 = require("../lib/ids");
class AuthService {
    repository;
    config;
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    async issueChallenge(address, nowIso) {
        const normalizedAddress = address.toLowerCase();
        const nonce = (0, ids_1.createToken)(12);
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
    resolveRole(address, employee) {
        if (address.toLowerCase() === this.config.adminWallet)
            return "admin";
        if (employee)
            return "employee";
        return null;
    }
    async verifyChallenge(input) {
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
        const recoveredAddress = (await (0, viem_1.recoverMessageAddress)({
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
        const token = (0, ids_1.createToken)(32);
        const expiresAt = new Date(Date.parse(input.nowIso) + this.config.sessionTtlHours * 60 * 60 * 1000).toISOString();
        const session = {
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
    getSession(token, nowIso) {
        this.repository.purgeExpiredSessions(nowIso);
        const session = this.repository.getSession(token);
        if (!session || session.expiresAt <= nowIso)
            return null;
        return session;
    }
}
exports.AuthService = AuthService;
