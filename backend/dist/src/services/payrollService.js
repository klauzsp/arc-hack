"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayrollService = void 0;
const payroll_1 = require("../domain/payroll");
const dates_1 = require("../lib/dates");
const ids_1 = require("../lib/ids");
function requireRecord(value, message) {
    if (value == null)
        throw new Error(message);
    return value;
}
function toRecipientResponse(employee, availableToWithdrawCents) {
    return {
        id: employee.id,
        walletAddress: employee.walletAddress,
        name: employee.name,
        payType: employee.payType,
        rate: (0, payroll_1.dollarsFromCents)(employee.rateCents),
        chainPreference: employee.chainPreference,
        destinationChainId: employee.destinationChainId,
        destinationWalletAddress: employee.destinationWalletAddress,
        scheduleId: employee.scheduleId,
        timeTrackingMode: employee.timeTrackingMode,
        active: employee.active,
        availableToWithdraw: typeof availableToWithdrawCents === "number" ? (0, payroll_1.dollarsFromCents)(availableToWithdrawCents) : undefined,
    };
}
function toScheduleResponse(schedule) {
    return {
        id: schedule.id,
        name: schedule.name,
        timezone: schedule.timezone,
        hoursPerDay: schedule.hoursPerDay,
        workingDays: schedule.workingDays,
    };
}
function toHolidayResponse(holiday) {
    return {
        id: holiday.id,
        date: holiday.date,
        name: holiday.name,
    };
}
function toTimeEntryResponse(entry) {
    return {
        id: entry.id,
        employeeId: entry.employeeId,
        date: entry.date,
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
        createdAt: entry.createdAt,
    };
}
function toPayRunResponse(payRun, items) {
    return {
        id: payRun.id,
        onChainId: payRun.onChainId,
        periodStart: payRun.periodStart,
        periodEnd: payRun.periodEnd,
        status: payRun.status,
        totalAmount: (0, payroll_1.dollarsFromCents)(payRun.totalAmountCents),
        recipientCount: items.length,
        executedAt: payRun.executedAt,
        txHash: payRun.txHash,
        items: items.map((item) => ({
            id: item.id,
            recipientId: item.employeeId,
            amount: (0, payroll_1.dollarsFromCents)(item.amountCents),
            chainId: item.destinationChainId,
            status: item.status,
            txHash: item.txHash,
        })),
    };
}
function toPolicyResponse(policy) {
    return {
        id: policy.id,
        name: policy.name,
        type: policy.type,
        status: policy.status,
        config: policy.config,
        lastRunAt: policy.lastRunAt,
    };
}
function toTreasuryResponse(balances, company, options) {
    return {
        totalUsdc: (0, payroll_1.dollarsFromCents)(balances.reduce((total, balance) => total + balance.usdcCents, 0)),
        totalUsyc: (0, payroll_1.dollarsFromCents)(company.treasuryUsycCents),
        chainBalances: balances.map((balance) => ({
            chainId: balance.chainId,
            chainName: balance.chainName,
            usdcBalance: (0, payroll_1.dollarsFromCents)(balance.usdcCents),
            isHub: balance.isHub,
        })),
        autoPolicy: {
            autoRebalanceEnabled: company.autoRebalanceEnabled,
            autoRedeemEnabled: company.autoRedeemEnabled,
            rebalanceThreshold: (0, payroll_1.dollarsFromCents)(company.rebalanceThresholdCents),
            payoutNoticeHours: company.payoutNoticeHours,
        },
        source: options?.source ?? "db",
        treasuryAddress: options?.treasuryAddress ?? null,
        controllerAddress: options?.controllerAddress ?? null,
        usycCustodyAddress: options?.usycCustodyAddress ?? null,
        payRunAddress: options?.payRunAddress ?? null,
        rebalanceAddress: options?.rebalanceAddress ?? null,
        readError: options?.readError ?? null,
    };
}
function usdcBaseUnitsToDollars(value) {
    return Number(value) / 1_000_000;
}
function usdcBaseUnitsToCents(value) {
    return Number(value / 10000n);
}
class PayrollService {
    repository;
    config;
    chainService;
    constructor(repository, config, chainService) {
        this.repository = repository;
        this.config = config;
        this.chainService = chainService;
    }
    getCompany() {
        return requireRecord(this.repository.getCompany(), "Company not configured.");
    }
    getHubBalance() {
        const hub = this.repository.listTreasuryBalances().find((balance) => balance.isHub);
        return requireRecord(hub ?? null, "Treasury hub balance not configured.");
    }
    getRecipients() {
        return this.repository.listEmployees();
    }
    getReferenceDate() {
        return this.config.seedDate;
    }
    getStoredTreasuryResponse(readError) {
        const company = this.getCompany();
        return toTreasuryResponse(this.repository.listTreasuryBalances(), company, {
            source: "db",
            treasuryAddress: this.config.liveChain?.coreAddress ?? null,
            controllerAddress: this.config.adminWallet,
            usycCustodyAddress: this.config.adminWallet,
            payRunAddress: this.config.liveChain?.payRunAddress ?? null,
            rebalanceAddress: this.config.liveChain?.rebalanceAddress ?? null,
            readError: readError ?? null,
        });
    }
    async getDashboardSummary() {
        const company = this.getCompany();
        const payRuns = this.repository.listPayRuns();
        const treasury = await this.getTreasury();
        const employees = this.repository.listEmployees();
        const upcoming = payRuns.find((payRun) => payRun.status === "approved" || payRun.status === "draft");
        const lastExecuted = payRuns.find((payRun) => payRun.status === "executed");
        const alerts = [];
        if (employees.some((employee) => !employee.chainPreference)) {
            alerts.push("Some recipients are missing a chain preference.");
        }
        if (treasury.source !== "chain") {
            alerts.push("Treasury is showing the last stored snapshot because the live Arc RPC read failed.");
        }
        if ((0, payroll_1.centsFromDollars)(treasury.totalUsdc) < company.rebalanceThresholdCents) {
            alerts.push("Arc treasury balance is below the configured rebalance threshold.");
        }
        return {
            today: this.getReferenceDate(),
            totalUsdc: treasury.totalUsdc,
            totalUsyc: treasury.totalUsyc,
            upcomingPayRun: upcoming
                ? {
                    id: upcoming.id,
                    periodStart: upcoming.periodStart,
                    periodEnd: upcoming.periodEnd,
                    totalAmount: (0, payroll_1.dollarsFromCents)(upcoming.totalAmountCents),
                    status: upcoming.status,
                }
                : null,
            lastExecutedPayRun: lastExecuted
                ? {
                    id: lastExecuted.id,
                    periodStart: lastExecuted.periodStart,
                    periodEnd: lastExecuted.periodEnd,
                    totalAmount: (0, payroll_1.dollarsFromCents)(lastExecuted.totalAmountCents),
                    executedAt: lastExecuted.executedAt,
                }
                : null,
            alerts,
        };
    }
    listRecipients() {
        const payRuns = this.repository.listPayRuns();
        const payRunItems = this.repository.listPayRunItems();
        const schedules = this.repository.listSchedules();
        const holidays = this.repository.listHolidays();
        const timeEntries = this.repository.listEmployees().flatMap((employee) => this.repository.listTimeEntries(employee.id));
        return this.getRecipients().map((employee) => {
            const metrics = (0, payroll_1.calculateRecipientMetrics)(employee, payRuns, payRunItems, schedules, holidays, timeEntries, this.getReferenceDate());
            return toRecipientResponse(employee, metrics.availableToWithdrawCents);
        });
    }
    createRecipient(input) {
        const employee = {
            id: (0, ids_1.createId)("recipient"),
            companyId: this.getCompany().id,
            walletAddress: input.walletAddress.toLowerCase(),
            name: input.name,
            role: "employee",
            payType: input.payType,
            rateCents: (0, payroll_1.centsFromDollars)(input.rate),
            chainPreference: input.chainPreference ?? "Arc",
            destinationChainId: input.destinationChainId ?? (0, payroll_1.chainIdFromPreference)(input.chainPreference ?? "Arc", this.config.arcChainId),
            destinationWalletAddress: input.destinationWalletAddress ?? null,
            scheduleId: input.scheduleId ?? this.repository.listSchedules()[0]?.id ?? null,
            timeTrackingMode: input.timeTrackingMode,
            active: true,
        };
        this.repository.createEmployee(employee);
        return toRecipientResponse(employee);
    }
    updateRecipient(id, input) {
        const patch = {};
        if (input.walletAddress !== undefined)
            patch.walletAddress = input.walletAddress.toLowerCase();
        if (input.name !== undefined)
            patch.name = input.name;
        if (input.payType !== undefined)
            patch.payType = input.payType;
        if (input.rate !== undefined)
            patch.rateCents = (0, payroll_1.centsFromDollars)(input.rate);
        if (input.chainPreference !== undefined)
            patch.chainPreference = input.chainPreference;
        if (input.destinationChainId !== undefined)
            patch.destinationChainId = input.destinationChainId;
        if (input.destinationWalletAddress !== undefined)
            patch.destinationWalletAddress = input.destinationWalletAddress;
        if (input.scheduleId !== undefined)
            patch.scheduleId = input.scheduleId;
        if (input.timeTrackingMode !== undefined)
            patch.timeTrackingMode = input.timeTrackingMode;
        if (input.active !== undefined)
            patch.active = input.active;
        const updated = requireRecord(this.repository.updateEmployee(id, patch), "Recipient not found.");
        return toRecipientResponse(updated);
    }
    deleteRecipient(id) {
        requireRecord(this.repository.getEmployee(id), "Recipient not found.");
        this.repository.deactivateEmployee(id);
        return { ok: true };
    }
    listSchedules() {
        return this.repository.listSchedules().map(toScheduleResponse);
    }
    createSchedule(input) {
        const schedule = {
            id: (0, ids_1.createId)("schedule"),
            companyId: this.getCompany().id,
            name: input.name,
            timezone: input.timezone,
            hoursPerDay: input.hoursPerDay,
            workingDays: input.workingDays,
        };
        this.repository.createSchedule(schedule);
        return toScheduleResponse(schedule);
    }
    updateSchedule(id, input) {
        const schedule = requireRecord(this.repository.updateSchedule(id, input), "Schedule not found.");
        return toScheduleResponse(schedule);
    }
    listHolidays() {
        return this.repository.listHolidays().map(toHolidayResponse);
    }
    createHoliday(input) {
        const holiday = {
            id: (0, ids_1.createId)("holiday"),
            companyId: this.getCompany().id,
            date: input.date,
            name: input.name,
        };
        this.repository.createHoliday(holiday);
        return toHolidayResponse(holiday);
    }
    updateHoliday(id, input) {
        const holiday = requireRecord(this.repository.updateHoliday(id, input), "Holiday not found.");
        return toHolidayResponse(holiday);
    }
    getProfile(address) {
        const employee = this.repository.getEmployeeByWallet(address.toLowerCase());
        const role = address.toLowerCase() === this.config.adminWallet ? "admin" : employee ? "employee" : null;
        return {
            role,
            employee: employee ? toRecipientResponse(employee) : null,
        };
    }
    getEmployeeProfile(id) {
        const employee = requireRecord(this.repository.getEmployee(id), "Employee not found.");
        return toRecipientResponse(employee);
    }
    getMeSchedule(address) {
        const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
        const schedule = (0, payroll_1.getSchedule)(employee.scheduleId, this.repository.listSchedules());
        return toScheduleResponse(schedule);
    }
    getMeHolidays() {
        return this.listHolidays();
    }
    getMyTimeEntries(address, start, end) {
        const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
        return this.repository.listTimeEntries(employee.id, start, end).map(toTimeEntryResponse);
    }
    getEmployeeTimeEntries(id, start, end) {
        requireRecord(this.repository.getEmployee(id), "Employee not found.");
        return this.repository.listTimeEntries(id, start, end).map(toTimeEntryResponse);
    }
    clockIn(address, input) {
        const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
        if (employee.timeTrackingMode !== "check_in_out") {
            throw new Error("Employee is configured for schedule-based tracking.");
        }
        const date = input?.date ?? this.getReferenceDate();
        if (this.repository.getOpenTimeEntry(employee.id)) {
            throw new Error("Employee is already clocked in.");
        }
        const timeEntries = this.repository.listTimeEntries(employee.id, date, date);
        const entry = {
            id: (0, ids_1.createId)("time"),
            employeeId: employee.id,
            date,
            clockIn: input?.clockIn ?? (0, payroll_1.suggestClockInTime)(employee.id, date, timeEntries),
            clockOut: null,
            createdAt: `${date}T${(0, dates_1.isoClock)()}:00.000Z`,
        };
        this.repository.createTimeEntry(entry);
        return toTimeEntryResponse(entry);
    }
    clockOut(address, input) {
        const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
        const openEntry = requireRecord(this.repository.getOpenTimeEntry(employee.id), "No active time entry to close.");
        const entriesToday = this.repository.listTimeEntries(employee.id, openEntry.date, openEntry.date);
        const clockOut = input?.clockOut ?? (0, payroll_1.suggestClockOutTime)(employee.id, openEntry.date, entriesToday, openEntry.clockIn);
        const updated = requireRecord(this.repository.closeTimeEntry(openEntry.id, clockOut), "Time entry not found.");
        return toTimeEntryResponse(updated);
    }
    getMyEarnings(address) {
        const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
        return this.getEmployeeEarnings(employee.id);
    }
    getEmployeeEarnings(id) {
        const employee = requireRecord(this.repository.getEmployee(id), "Employee not found.");
        const payRuns = this.repository.listPayRuns();
        const payRunItems = this.repository.listPayRunItems();
        const schedules = this.repository.listSchedules();
        const holidays = this.repository.listHolidays();
        const timeEntries = this.repository.listTimeEntries(employee.id);
        const metrics = (0, payroll_1.calculateRecipientMetrics)(employee, payRuns, payRunItems, schedules, holidays, timeEntries, this.getReferenceDate());
        const currentPeriod = (0, dates_1.currentSemimonthlyPeriod)(this.getReferenceDate());
        return {
            employee: toRecipientResponse(employee),
            currentPeriod: {
                start: currentPeriod.periodStart,
                end: currentPeriod.periodEnd,
                earned: (0, payroll_1.dollarsFromCents)(metrics.currentPeriodEarnedCents),
            },
            ytdEarned: (0, payroll_1.dollarsFromCents)(metrics.ytdEarnedCents),
            alreadyPaid: (0, payroll_1.dollarsFromCents)(metrics.totalPaidCents),
            availableToWithdraw: (0, payroll_1.dollarsFromCents)(metrics.availableToWithdrawCents),
            breakdown: {
                currentPeriodHours: metrics.currentPeriodHours,
                ytdHours: metrics.ytdHours,
                currentPeriodDays: metrics.currentPeriodDays,
                ytdDays: metrics.ytdDays,
                currentPeriodHolidayCount: metrics.currentPeriodHolidayCount,
                ytdHolidayCount: metrics.ytdHolidayCount,
                scheduleHoursPerDay: metrics.scheduleHoursPerDay,
            },
        };
    }
    buildPayRunItems(periodStart, periodEnd, employeeIds) {
        const employees = (employeeIds?.length
            ? employeeIds.map((employeeId) => requireRecord(this.repository.getEmployee(employeeId), `Employee ${employeeId} not found.`))
            : this.repository.listEmployees()).filter((employee) => employee.active);
        const schedules = this.repository.listSchedules();
        const holidays = this.repository.listHolidays();
        const timeEntries = employees.flatMap((employee) => this.repository.listTimeEntries(employee.id));
        return (0, payroll_1.buildPayRunItemsPreview)(employees, schedules, holidays, timeEntries, periodStart, periodEnd, this.getReferenceDate(), this.config.arcChainId);
    }
    createPayRunItemsRecords(payRunId, previews) {
        return previews.map((item, index) => ({
            id: `${payRunId}-item-${index + 1}`,
            payRunId,
            employeeId: item.employeeId,
            recipientWalletAddress: item.recipientWalletAddress,
            destinationChainId: item.destinationChainId,
            amountCents: item.amountCents,
            status: item.status,
            txHash: null,
        }));
    }
    listPayRuns() {
        return this.repository.listPayRuns().map((payRun) => toPayRunResponse(payRun, this.repository.listPayRunItems(payRun.id)));
    }
    getPayRun(id) {
        const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
        return toPayRunResponse(payRun, this.repository.listPayRunItems(id));
    }
    createPayRun(input) {
        const previews = this.buildPayRunItems(input.periodStart, input.periodEnd, input.employeeIds);
        if (previews.length === 0) {
            throw new Error("Add at least one active recipient before creating a treasury pay run.");
        }
        const payRunId = (0, ids_1.createId)("payrun");
        const now = (0, dates_1.nowIso)();
        const payRun = {
            id: payRunId,
            companyId: this.getCompany().id,
            onChainId: null,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            status: "draft",
            totalAmountCents: previews.reduce((total, item) => total + item.amountCents, 0),
            executedAt: null,
            txHash: null,
            createdAt: now,
            updatedAt: now,
        };
        const items = this.createPayRunItemsRecords(payRunId, previews);
        this.repository.createPayRun(payRun, items);
        return toPayRunResponse(payRun, items);
    }
    updatePayRun(id, input) {
        const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
        if (payRun.status === "executed")
            throw new Error("Executed pay runs cannot be edited.");
        const periodStart = input.periodStart ?? payRun.periodStart;
        const periodEnd = input.periodEnd ?? payRun.periodEnd;
        const previews = this.buildPayRunItems(periodStart, periodEnd, input.employeeIds);
        if (previews.length === 0) {
            throw new Error("A treasury pay run must contain at least one active recipient.");
        }
        const items = this.createPayRunItemsRecords(id, previews);
        const updated = requireRecord(this.repository.updatePayRun(id, {
            periodStart,
            periodEnd,
            totalAmountCents: previews.reduce((total, item) => total + item.amountCents, 0),
            updatedAt: (0, dates_1.nowIso)(),
        }), "Pay run not found.");
        this.repository.replacePayRunItems(id, items);
        return toPayRunResponse(updated, items);
    }
    async approvePayRun(id) {
        const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
        if (payRun.status !== "draft")
            throw new Error("Only draft pay runs can be approved.");
        const items = this.repository.listPayRunItems(id);
        if (items.length === 0 || payRun.totalAmountCents <= 0) {
            throw new Error("A treasury pay run must contain at least one payable recipient before approval.");
        }
        const onChainId = payRun.onChainId ?? await this.chainService.createPayRun({ payRun, items });
        for (const item of items) {
            this.repository.updatePayRunItem(item.id, {
                status: "ready",
            });
        }
        const updated = requireRecord(this.repository.updatePayRun(id, {
            onChainId,
            status: "approved",
            updatedAt: (0, dates_1.nowIso)(),
        }), "Pay run not found.");
        return toPayRunResponse(updated, this.repository.listPayRunItems(id));
    }
    async ensureLiquidity(requiredCents) {
        const company = this.getCompany();
        if (this.config.chainMode === "live") {
            const snapshot = await this.chainService.getTreasurySnapshot();
            if (!snapshot)
                return null;
            const treasuryUsdcCents = usdcBaseUnitsToCents(snapshot.treasuryUsdcBaseUnits);
            if (treasuryUsdcCents >= requiredCents)
                return null;
            if (!company.autoRedeemEnabled) {
                throw new Error("Insufficient USDC in the Arc treasury and auto-redeem is disabled.");
            }
            const shortfall = requiredCents - treasuryUsdcCents;
            if (usdcBaseUnitsToCents(snapshot.controllerUsycBaseUnits) < shortfall) {
                throw new Error("Insufficient USDC in treasury and insufficient CEO-managed USYC to top up payroll.");
            }
            await this.chainService.rebalanceUsycToUsdc(shortfall);
            return shortfall;
        }
        const hub = this.getHubBalance();
        if (hub.usdcCents >= requiredCents)
            return null;
        if (!company.autoRedeemEnabled) {
            throw new Error("Insufficient USDC in the Arc treasury and auto-redeem is disabled.");
        }
        const shortfall = requiredCents - hub.usdcCents;
        if (company.treasuryUsycCents < shortfall) {
            throw new Error("Insufficient USDC and USYC to execute the pay run.");
        }
        await this.chainService.rebalanceUsycToUsdc(shortfall);
        company.treasuryUsycCents -= shortfall;
        hub.usdcCents += shortfall;
        this.repository.updateCompany(company);
        this.repository.updateTreasuryBalance(hub.chainId, hub.usdcCents);
        return shortfall;
    }
    async executePayRun(id) {
        const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
        if (payRun.status !== "approved")
            throw new Error("Only approved pay runs can be executed.");
        const items = this.repository.listPayRunItems(id);
        await this.ensureLiquidity(payRun.totalAmountCents);
        const onChainId = payRun.onChainId ?? await this.chainService.createPayRun({ payRun, items });
        const execution = await this.chainService.executePayRun({
            ...payRun,
            onChainId,
        });
        const hasCrossChainItems = items.some((item) => item.destinationChainId !== this.config.arcChainId);
        if (this.config.chainMode !== "live") {
            const hub = this.getHubBalance();
            hub.usdcCents -= payRun.totalAmountCents;
            this.repository.updateTreasuryBalance(hub.chainId, hub.usdcCents);
        }
        for (const item of items) {
            const isArcItem = item.destinationChainId === this.config.arcChainId;
            this.repository.updatePayRunItem(item.id, {
                status: isArcItem ? "paid" : "processing",
                txHash: isArcItem ? execution.txHash : `bridge-${execution.txHash}`,
            });
        }
        const updated = requireRecord(this.repository.updatePayRun(id, {
            onChainId: execution.onChainId,
            status: hasCrossChainItems ? "processing" : "executed",
            executedAt: hasCrossChainItems ? null : (0, dates_1.nowIso)(),
            txHash: execution.txHash,
            updatedAt: (0, dates_1.nowIso)(),
        }), "Pay run not found.");
        return toPayRunResponse(updated, this.repository.listPayRunItems(id));
    }
    async finalizePayRun(id) {
        const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
        if (payRun.status !== "processing")
            throw new Error("Only processing pay runs can be finalized.");
        await this.chainService.finalizePayRun(payRun);
        for (const item of this.repository.listPayRunItems(id)) {
            if (item.status !== "paid") {
                this.repository.updatePayRunItem(item.id, {
                    status: "paid",
                });
            }
        }
        const updated = requireRecord(this.repository.updatePayRun(id, {
            status: "executed",
            executedAt: (0, dates_1.nowIso)(),
            updatedAt: (0, dates_1.nowIso)(),
        }), "Pay run not found.");
        return toPayRunResponse(updated, this.repository.listPayRunItems(id));
    }
    async getTreasury() {
        const company = this.getCompany();
        if (this.config.chainMode === "live") {
            try {
                const snapshot = await this.chainService.getTreasurySnapshot();
                if (snapshot) {
                    return {
                        totalUsdc: usdcBaseUnitsToDollars(snapshot.treasuryUsdcBaseUnits),
                        totalUsyc: usdcBaseUnitsToDollars(snapshot.controllerUsycBaseUnits),
                        chainBalances: [
                            {
                                chainId: this.config.arcChainId,
                                chainName: "Arc Testnet",
                                usdcBalance: usdcBaseUnitsToDollars(snapshot.treasuryUsdcBaseUnits),
                                isHub: true,
                            },
                        ],
                        autoPolicy: {
                            autoRebalanceEnabled: company.autoRebalanceEnabled,
                            autoRedeemEnabled: company.autoRedeemEnabled,
                            rebalanceThreshold: (0, payroll_1.dollarsFromCents)(company.rebalanceThresholdCents),
                            payoutNoticeHours: company.payoutNoticeHours,
                        },
                        source: "chain",
                        treasuryAddress: snapshot.coreAddress,
                        controllerAddress: snapshot.controllerAddress,
                        usycCustodyAddress: snapshot.controllerAddress,
                        payRunAddress: snapshot.payRunAddress,
                        rebalanceAddress: snapshot.rebalanceAddress,
                        readError: null,
                    };
                }
            }
            catch (error) {
                return this.getStoredTreasuryResponse(error instanceof Error ? error.message : "Live Arc RPC read failed.");
            }
        }
        return toTreasuryResponse(this.repository.listTreasuryBalances(), company);
    }
    async manualRebalance(input) {
        const amountCents = (0, payroll_1.centsFromDollars)(input.amount);
        const company = this.getCompany();
        const hub = this.getHubBalance();
        let txHash = "";
        if (this.config.chainMode === "live") {
            txHash =
                input.direction === "usdc_to_usyc"
                    ? await this.chainService.rebalanceUsdcToUsyc(amountCents)
                    : await this.chainService.rebalanceUsycToUsdc(amountCents);
            return {
                txHash,
                treasury: await this.getTreasury(),
            };
        }
        if (input.direction === "usdc_to_usyc") {
            if (hub.usdcCents < amountCents)
                throw new Error("Insufficient USDC in treasury.");
            txHash = await this.chainService.rebalanceUsdcToUsyc(amountCents);
            hub.usdcCents -= amountCents;
            company.treasuryUsycCents += amountCents;
        }
        else {
            if (company.treasuryUsycCents < amountCents)
                throw new Error("Insufficient USYC in treasury.");
            txHash = await this.chainService.rebalanceUsycToUsdc(amountCents);
            company.treasuryUsycCents -= amountCents;
            hub.usdcCents += amountCents;
        }
        this.repository.updateCompany(company);
        this.repository.updateTreasuryBalance(hub.chainId, hub.usdcCents);
        return {
            txHash,
            treasury: await this.getTreasury(),
        };
    }
    updateAutoPolicy(input) {
        const company = this.getCompany();
        if (input.autoRebalanceEnabled !== undefined)
            company.autoRebalanceEnabled = input.autoRebalanceEnabled;
        if (input.autoRedeemEnabled !== undefined)
            company.autoRedeemEnabled = input.autoRedeemEnabled;
        if (input.rebalanceThreshold !== undefined)
            company.rebalanceThresholdCents = (0, payroll_1.centsFromDollars)(input.rebalanceThreshold);
        if (input.payoutNoticeHours !== undefined)
            company.payoutNoticeHours = input.payoutNoticeHours;
        this.repository.updateCompany(company);
        return toTreasuryResponse(this.repository.listTreasuryBalances(), company).autoPolicy;
    }
    listPolicies() {
        return this.repository.listPolicies().map(toPolicyResponse);
    }
    createPolicy(input) {
        const policy = {
            id: (0, ids_1.createId)("policy"),
            companyId: this.getCompany().id,
            name: input.name,
            type: input.type,
            status: input.status ?? "active",
            config: input.config ?? {},
            lastRunAt: null,
        };
        this.repository.createPolicy(policy);
        return toPolicyResponse(policy);
    }
    updatePolicy(id, input) {
        const policy = requireRecord(this.repository.updatePolicy(id, input), "Policy not found.");
        return toPolicyResponse(policy);
    }
    async runAutoRebalanceJob() {
        const company = this.getCompany();
        if (!company.autoRebalanceEnabled) {
            return { ran: false, reason: "Auto rebalance disabled." };
        }
        const upcomingPayRun = this.repository.listPayRuns().find((payRun) => payRun.status === "approved");
        if (upcomingPayRun) {
            return { ran: false, reason: "Approved pay run pending execution." };
        }
        const hub = this.getHubBalance();
        const idleAmount = hub.usdcCents - company.rebalanceThresholdCents;
        if (idleAmount <= 0) {
            return { ran: false, reason: "No idle USDC available above threshold." };
        }
        const result = await this.manualRebalance({
            direction: "usdc_to_usyc",
            amount: (0, payroll_1.dollarsFromCents)(idleAmount),
        });
        return { ran: true, txHash: result.txHash, amount: (0, payroll_1.dollarsFromCents)(idleAmount) };
    }
    runPolicyEngine() {
        const today = this.getReferenceDate();
        const { periodStart, periodEnd } = (0, dates_1.currentSemimonthlyPeriod)(today);
        const existing = this.repository.listPayRuns().find((payRun) => payRun.periodStart === periodStart && payRun.periodEnd === periodEnd);
        if (existing) {
            return { created: false, payRunId: existing.id };
        }
        const policy = this.repository.listPolicies().find((entry) => entry.type === "payday" && entry.status === "active");
        if (!policy) {
            return { created: false, payRunId: null };
        }
        const payRun = this.createPayRun({ periodStart, periodEnd });
        this.repository.updatePolicy(policy.id, { lastRunAt: (0, dates_1.nowIso)() });
        return { created: true, payRunId: payRun.id };
    }
}
exports.PayrollService = PayrollService;
