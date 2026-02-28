"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const viem_1 = require("viem");
const payroll_1 = require("../domain/payroll");
const ids_1 = require("../lib/ids");
function publicWalletAddress(value) {
    return value && value.startsWith("0x") ? value : null;
}
function toEmployeeResponse(employee) {
    return {
        id: employee.id,
        walletAddress: publicWalletAddress(employee.walletAddress),
        name: employee.name,
        payType: employee.payType,
        rate: (0, payroll_1.dollarsFromCents)(employee.rateCents),
        chainPreference: employee.chainPreference,
        destinationChainId: employee.destinationChainId,
        destinationWalletAddress: publicWalletAddress(employee.destinationWalletAddress) ??
            publicWalletAddress(employee.walletAddress),
        scheduleId: employee.scheduleId,
        timeTrackingMode: employee.timeTrackingMode,
        employmentStartDate: employee.employmentStartDate,
        onboardingStatus: employee.onboardingStatus,
        onboardingMethod: employee.onboardingMethod,
        claimedAt: employee.claimedAt,
        activeInvite: null,
        active: employee.active,
    };
}
function createAccessCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = (0, node_crypto_1.randomBytes)(8);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function hashAccessCode(code) {
    return (0, node_crypto_1.createHash)("sha256").update(code.trim().toUpperCase()).digest("hex");
}
class AuthService {
    repository;
    config;
    circleWalletService;
    constructor(repository, config, circleWalletService) {
        this.repository = repository;
        this.config = config;
        this.circleWalletService = circleWalletService;
    }
    resolveRole(address, employee) {
        if (address.toLowerCase() === this.config.adminWallet)
            return "admin";
        if (employee)
            return "employee";
        return null;
    }
    createSession(address, role, employeeId, nowIso) {
        const token = (0, ids_1.createToken)(32);
        const expiresAt = new Date(Date.parse(nowIso) + this.config.sessionTtlHours * 60 * 60 * 1000).toISOString();
        const session = {
            token,
            address: address.toLowerCase(),
            role,
            employeeId,
            expiresAt,
        };
        this.repository.createSession(session);
        return session;
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
        const session = this.createSession(normalizedAddress, role, employee?.id ?? null, input.nowIso);
        return {
            token: session.token,
            role,
            employee: employee ? toEmployeeResponse(employee) : null,
        };
    }
    getValidInvite(code, nowIso) {
        const invite = this.repository.getEmployeeInviteCodeByHash(hashAccessCode(code));
        if (!invite || invite.usedAt) {
            throw new Error("Access code is invalid or already used.");
        }
        if (invite.expiresAt <= nowIso) {
            throw new Error("Access code has expired.");
        }
        const employee = this.repository.getEmployee(invite.employeeId);
        if (!employee || !employee.active) {
            throw new Error("Employee record is no longer active.");
        }
        if (employee.onboardingStatus === "claimed") {
            throw new Error("This employee has already completed onboarding.");
        }
        return { invite, employee };
    }
    createRecipientAccessCode(employeeId, createdBy, nowIso) {
        const employee = this.repository.getEmployee(employeeId);
        if (!employee || !employee.active) {
            throw new Error("Recipient not found.");
        }
        if (employee.onboardingStatus === "claimed") {
            throw new Error("This employee has already completed onboarding.");
        }
        this.repository.invalidateActiveInviteCodes(employeeId, nowIso);
        const code = createAccessCode();
        const expiresAt = new Date(Date.parse(nowIso) + 14 * 24 * 60 * 60 * 1000).toISOString();
        const invite = this.repository.createEmployeeInviteCode({
            id: (0, ids_1.createId)("invite"),
            employeeId,
            codeHash: hashAccessCode(code),
            createdBy: createdBy.toLowerCase(),
            createdAt: nowIso,
            expiresAt,
            usedAt: null,
        });
        return {
            code,
            invite: {
                id: invite.id,
                employeeId: invite.employeeId,
                createdAt: invite.createdAt,
                expiresAt: invite.expiresAt,
            },
            employee: toEmployeeResponse(employee),
        };
    }
    redeemInviteCode(code, nowIso) {
        const { invite, employee } = this.getValidInvite(code, nowIso);
        return {
            employee: toEmployeeResponse(employee),
            invite: {
                id: invite.id,
                createdAt: invite.createdAt,
                expiresAt: invite.expiresAt,
            },
            options: {
                existingWallet: true,
                circleWallet: this.circleWalletService.isConfigured(),
            },
        };
    }
    async issueWalletClaimChallenge(input) {
        const normalizedAddress = input.address.toLowerCase();
        if (!(0, viem_1.isAddress)(normalizedAddress)) {
            throw new Error("A valid EVM wallet address is required.");
        }
        const { employee } = this.getValidInvite(input.code, input.nowIso);
        const nonce = (0, ids_1.createToken)(12);
        const expiresAt = new Date(Date.parse(input.nowIso) + 5 * 60 * 1000).toISOString();
        const message = [
            `${this.config.companyName} Employee Onboarding`,
            `Address: ${normalizedAddress}`,
            `Recipient: ${employee.id}`,
            `Nonce: ${nonce}`,
            `Issued At: ${input.nowIso}`,
            "Purpose: claim payroll access and attach this wallet to the employee record.",
        ].join("\n");
        return this.repository.storeChallenge({
            address: normalizedAddress,
            nonce,
            message,
            expiresAt,
        });
    }
    async claimInviteWithWallet(input) {
        const normalizedAddress = input.address.toLowerCase();
        if (!(0, viem_1.isAddress)(normalizedAddress)) {
            throw new Error("A valid EVM wallet address is required.");
        }
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
        const { invite, employee } = this.getValidInvite(input.code, input.nowIso);
        const existing = this.repository.getEmployeeByWalletIncludingInactive(normalizedAddress);
        if (existing && existing.id !== employee.id) {
            throw new Error("That wallet is already assigned to another employee.");
        }
        const updated = this.repository.updateEmployee(employee.id, {
            walletAddress: normalizedAddress,
            destinationWalletAddress: employee.destinationWalletAddress ?? normalizedAddress,
            destinationChainId: employee.destinationChainId ??
                (0, payroll_1.chainIdFromPreference)(employee.chainPreference ?? "Arc", this.config.arcChainId),
            onboardingStatus: "claimed",
            onboardingMethod: "existing_wallet",
            claimedAt: input.nowIso,
        });
        this.repository.useEmployeeInviteCode(invite.id, input.nowIso);
        this.repository.deleteChallenge(normalizedAddress);
        const session = this.createSession(normalizedAddress, "employee", employee.id, input.nowIso);
        return {
            token: session.token,
            role: "employee",
            employee: toEmployeeResponse(updated ?? employee),
        };
    }
    async startCircleOnboarding(code, nowIso) {
        const { employee } = this.getValidInvite(code, nowIso);
        if (!this.circleWalletService.isConfigured()) {
            throw new Error("Circle user-controlled wallet onboarding is not configured.");
        }
        const tokenData = await this.circleWalletService.createUserToken(employee.id);
        if (employee.circleUserId !== tokenData.userId) {
            this.repository.updateEmployee(employee.id, {
                circleUserId: tokenData.userId,
            });
        }
        const provisioning = await this.circleWalletService.startArcWalletProvisioning(employee.id, tokenData.userToken);
        return {
            employee: toEmployeeResponse(this.repository.getEmployee(employee.id) ?? employee),
            circle: {
                appId: tokenData.appId,
                userToken: tokenData.userToken,
                encryptionKey: tokenData.encryptionKey,
                challengeId: provisioning.challengeId,
                walletAddress: provisioning.wallet?.address?.toLowerCase() ?? null,
            },
        };
    }
    async completeCircleOnboarding(input) {
        const { invite, employee } = this.getValidInvite(input.code, input.nowIso);
        if (!this.circleWalletService.isConfigured()) {
            throw new Error("Circle user-controlled wallet onboarding is not configured.");
        }
        const wallet = await this.circleWalletService.getArcWallet(input.userToken);
        const walletAddress = wallet?.address?.toLowerCase();
        if (!walletAddress || !(0, viem_1.isAddress)(walletAddress)) {
            throw new Error("No Arc wallet is available yet for this Circle user.");
        }
        const existing = this.repository.getEmployeeByWalletIncludingInactive(walletAddress);
        if (existing && existing.id !== employee.id) {
            throw new Error("That Circle wallet is already assigned to another employee.");
        }
        const updated = this.repository.updateEmployee(employee.id, {
            walletAddress,
            destinationWalletAddress: walletAddress,
            chainPreference: "Arc",
            destinationChainId: (0, payroll_1.chainIdFromPreference)("Arc", this.config.arcChainId),
            onboardingStatus: "claimed",
            onboardingMethod: "circle",
            claimedAt: input.nowIso,
            circleWalletId: wallet?.id ?? employee.circleWalletId,
        });
        this.repository.useEmployeeInviteCode(invite.id, input.nowIso);
        const session = this.createSession(walletAddress, "employee", employee.id, input.nowIso);
        return {
            token: session.token,
            role: "employee",
            employee: toEmployeeResponse(updated ?? employee),
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
