import { AppConfig } from "../config";
import { buildPayRunItemsPreview, calculateRecipientMetrics, chainIdFromPreference, centsFromDollars, dollarsFromCents, getSchedule, suggestClockInTime, suggestClockOutTime } from "../domain/payroll";
import type {
  CompanyRecord,
  DashboardSummary,
  EmployeeRecord,
  HolidayRecord,
  PayRunItemPreview,
  PayRunItemRecord,
  PayRunRecord,
  PolicyRecord,
  ScheduleRecord,
  TimeOffRequestRecord,
  TimeEntryRecord,
  TreasuryBalanceRecord,
  WithdrawalRecord,
} from "../domain/types";
import { ARC_TESTNET_CCTP_DOMAIN } from "../lib/cctp";
import { currentSemimonthlyPeriod, isoClock, nowIso, todayIso } from "../lib/dates";
import { createId } from "../lib/ids";
import { PayrollRepository } from "../repository";
import { ChainService } from "./chainService";

function requireRecord<T>(value: T | null | undefined, message: string): NonNullable<T> {
  if (value == null) throw new Error(message);
  return value as NonNullable<T>;
}

function publicWalletAddress(value: string | null | undefined) {
  return value && value.startsWith("0x") ? value : null;
}

function toRecipientResponse(
  employee: EmployeeRecord,
  options?: Partial<{
    availableToWithdrawCents: number;
    activeInvite: { id: string; createdAt: string; expiresAt: string } | null;
  }>,
) {
  return {
    id: employee.id,
    walletAddress: publicWalletAddress(employee.walletAddress),
    name: employee.name,
    payType: employee.payType,
    rate: dollarsFromCents(employee.rateCents),
    chainPreference: employee.chainPreference,
    destinationChainId: employee.destinationChainId,
    destinationWalletAddress:
      publicWalletAddress(employee.destinationWalletAddress) ??
      publicWalletAddress(employee.walletAddress),
    scheduleId: employee.scheduleId,
    timeTrackingMode: employee.timeTrackingMode,
    employmentStartDate: employee.employmentStartDate,
    onboardingStatus: employee.onboardingStatus,
    onboardingMethod: employee.onboardingMethod,
    claimedAt: employee.claimedAt,
    activeInvite: options?.activeInvite ?? null,
    active: employee.active,
    availableToWithdraw:
      typeof options?.availableToWithdrawCents === "number"
        ? dollarsFromCents(options.availableToWithdrawCents)
        : undefined,
  };
}

function toScheduleResponse(schedule: ScheduleRecord) {
  return {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    startTime: schedule.startTime,
    hoursPerDay: schedule.hoursPerDay,
    workingDays: schedule.workingDays,
  };
}

function toHolidayResponse(holiday: HolidayRecord) {
  return {
    id: holiday.id,
    date: holiday.date,
    name: holiday.name,
  };
}

function toTimeEntryResponse(entry: TimeEntryRecord) {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    date: entry.date,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    createdAt: entry.createdAt,
  };
}

function toPayRunResponse(payRun: PayRunRecord, items: PayRunItemRecord[]) {
  return {
    id: payRun.id,
    onChainId: payRun.onChainId,
    periodStart: payRun.periodStart,
    periodEnd: payRun.periodEnd,
    status: payRun.status,
    totalAmount: dollarsFromCents(payRun.totalAmountCents),
    recipientCount: items.length,
    executedAt: payRun.executedAt,
    txHash: payRun.txHash,
    items: items.map((item) => ({
      id: item.id,
      recipientId: item.employeeId,
      amount: dollarsFromCents(item.amountCents),
      chainId: item.destinationChainId,
      useForwarder: item.useForwarder,
      status: item.status,
      txHash: item.txHash,
    })),
  };
}

function toPolicyResponse(policy: PolicyRecord) {
  return {
    id: policy.id,
    name: policy.name,
    type: policy.type,
    status: policy.status,
    config: policy.config,
    lastRunAt: policy.lastRunAt,
  };
}

function timeOffYearWindow(date: string) {
  const year = Number(date.slice(0, 4));
  const monthDay = date.slice(5);
  if (monthDay >= "04-01") {
    return {
      yearStart: `${year}-04-01`,
      yearEnd: `${year + 1}-03-31`,
    };
  }

  return {
    yearStart: `${year - 1}-04-01`,
    yearEnd: `${year}-03-31`,
  };
}

function countsAgainstTimeOffLimit(status: TimeOffRequestRecord["status"]) {
  return status === "pending" || status === "approved";
}

function toTimeOffRequestResponse(request: TimeOffRequestRecord, employee?: EmployeeRecord | null) {
  return {
    id: request.id,
    employeeId: request.employeeId,
    employeeName: employee?.name ?? null,
    date: request.date,
    note: request.note,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    reviewedAt: request.reviewedAt,
  };
}

function toTreasuryResponse(
  balances: TreasuryBalanceRecord[],
  company: CompanyRecord,
  options?: Partial<{
    source: "db" | "chain";
    treasuryAddress: string | null;
    controllerAddress: string | null;
    usycCustodyAddress: string | null;
    payRunAddress: string | null;
    rebalanceAddress: string | null;
    readError: string | null;
  }>,
) {
  return {
    totalUsdc: dollarsFromCents(balances.reduce((total, balance) => total + balance.usdcCents, 0)),
    totalUsyc: dollarsFromCents(company.treasuryUsycCents),
    chainBalances: balances.map((balance) => ({
      chainId: balance.chainId,
      chainName: balance.chainName,
      usdcBalance: dollarsFromCents(balance.usdcCents),
      isHub: balance.isHub,
    })),
    autoPolicy: {
      autoRebalanceEnabled: company.autoRebalanceEnabled,
      autoRedeemEnabled: company.autoRedeemEnabled,
      rebalanceThreshold: dollarsFromCents(company.rebalanceThresholdCents),
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

function usdcBaseUnitsToDollars(value: bigint) {
  return Number(value) / 1_000_000;
}

function usdcBaseUnitsToCents(value: bigint) {
  return Number(value / 10_000n);
}

export class PayrollService {
  constructor(
    private readonly repository: PayrollRepository,
    private readonly config: AppConfig,
    private readonly chainService: ChainService,
  ) {}

  private getCompany() {
    return requireRecord(this.repository.getCompany(), "Company not configured.");
  }

  private getHubBalance() {
    const hub = this.repository.listTreasuryBalances().find((balance) => balance.isHub);
    return requireRecord(hub ?? null, "Treasury hub balance not configured.");
  }

  private getRecipients() {
    return this.repository.listEmployees();
  }

  private getReferenceNow() {
    return this.config.referenceNowOverride ?? nowIso();
  }

  private getReferenceDate() {
    return this.getReferenceNow().slice(0, 10);
  }

  private approvedTimeOffRequests(employeeId?: string) {
    return this.repository
      .listTimeOffRequests(employeeId)
      .filter((request) => request.status === "approved");
  }

  private timeOffAllowance(employee: EmployeeRecord, date = this.getReferenceDate(), excludeRequestId?: string) {
    const company = this.getCompany();
    const { yearStart, yearEnd } = timeOffYearWindow(date);
    const requests = this.repository
      .listTimeOffRequests(employee.id)
      .filter((request) => request.id !== excludeRequestId)
      .filter((request) => request.date >= yearStart && request.date <= yearEnd);
    const approvedDays = requests.filter((request) => request.status === "approved").length;
    const reservedDays = requests.filter((request) => countsAgainstTimeOffLimit(request.status)).length;

    return {
      yearStart,
      yearEnd,
      maxDays: company.maxTimeOffDaysPerYear,
      approvedDays,
      reservedDays,
      remainingDays: Math.max(company.maxTimeOffDaysPerYear - reservedDays, 0),
    };
  }

  private assertTimeOffWithinLimit(employee: EmployeeRecord, date: string, excludeRequestId?: string) {
    const allowance = this.timeOffAllowance(employee, date, excludeRequestId);
    if (allowance.reservedDays >= allowance.maxDays) {
      throw new Error(
        `This request would exceed the ${allowance.maxDays}-day annual time-off limit for ${allowance.yearStart} to ${allowance.yearEnd}.`,
      );
    }
    return allowance;
  }

  private validateTimeOffDate(employee: EmployeeRecord, date: string, excludeRequestId?: string) {
    if (date < this.getReferenceDate()) {
      throw new Error("Time off can only be requested for today or future working days.");
    }

    const existing = this.repository
      .listTimeOffRequests(employee.id)
      .find(
        (request) =>
          request.id !== excludeRequestId &&
          request.date === date &&
          countsAgainstTimeOffLimit(request.status),
      );
    if (existing) {
      throw new Error("You already have a day-off request booked for that date.");
    }

    if (this.repository.listHolidays().some((holiday) => holiday.date === date)) {
      throw new Error("That date is already a company holiday and does not need a separate day-off request.");
    }

    const schedule = getSchedule(employee.scheduleId, this.repository.listSchedules());
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!schedule.workingDays.includes(dayOfWeek)) {
      throw new Error("Time off can only be requested on a scheduled working day.");
    }
  }

  private getStoredTreasuryResponse(readError?: string) {
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

  async getDashboardSummary(): Promise<DashboardSummary> {
    const company = this.getCompany();
    const payRuns = this.repository.listPayRuns();
    const treasury = await this.getTreasury();
    const employees = this.repository.listEmployees();
    const upcoming = payRuns.find((payRun) => payRun.status === "approved" || payRun.status === "draft");
    const lastExecuted = payRuns.find((payRun) => payRun.status === "executed");
    const alerts: string[] = [];

    if (employees.some((employee) => !employee.chainPreference)) {
      alerts.push("Some recipients are missing a chain preference.");
    }
    if (employees.some((employee) => employee.onboardingStatus !== "claimed")) {
      alerts.push("Some recipients have not completed onboarding and are excluded from treasury pay runs.");
    }
    if (treasury.source !== "chain") {
      alerts.push("Treasury is showing the last stored snapshot because the live Arc RPC read failed.");
    }
    if (centsFromDollars(treasury.totalUsdc) < company.rebalanceThresholdCents) {
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
            totalAmount: dollarsFromCents(upcoming.totalAmountCents),
            status: upcoming.status,
          }
        : null,
      lastExecutedPayRun: lastExecuted
        ? {
            id: lastExecuted.id,
            periodStart: lastExecuted.periodStart,
            periodEnd: lastExecuted.periodEnd,
            totalAmount: dollarsFromCents(lastExecuted.totalAmountCents),
            executedAt: lastExecuted.executedAt,
          }
        : null,
      alerts,
    };
  }

  listRecipients() {
    const payRuns = this.repository.listPayRuns();
    const payRunItems = this.repository.listPayRunItems();
    const withdrawals = this.repository.listWithdrawals();
    const schedules = this.repository.listSchedules();
    const holidays = this.repository.listHolidays();
    const approvedTimeOffRequests = this.approvedTimeOffRequests();
    const timeEntries = this.repository.listEmployees().flatMap((employee) => this.repository.listTimeEntries(employee.id));
    return this.getRecipients().map((employee) => {
      const invite = this.repository.getActiveEmployeeInviteCode(employee.id, this.getReferenceNow());
      const metrics = calculateRecipientMetrics(
        employee,
        payRuns,
        payRunItems,
        withdrawals,
        schedules,
        holidays,
        approvedTimeOffRequests.filter((request) => request.employeeId === employee.id),
        timeEntries,
        this.getReferenceNow(),
        this.getReferenceDate(),
      );
      return toRecipientResponse(employee, {
        availableToWithdrawCents: metrics.availableToWithdrawCents,
        activeInvite: invite
          ? {
              id: invite.id,
              createdAt: invite.createdAt,
              expiresAt: invite.expiresAt,
            }
          : null,
      });
    });
  }

  createRecipient(input: {
    walletAddress?: string | null;
    name: string;
    payType: EmployeeRecord["payType"];
    rate: number;
    chainPreference?: string | null;
    destinationChainId?: number | null;
    destinationWalletAddress?: string | null;
    scheduleId?: string | null;
    timeTrackingMode: EmployeeRecord["timeTrackingMode"];
    employmentStartDate?: string | null;
  }) {
    const currentPeriod = currentSemimonthlyPeriod(this.getReferenceDate());
    const employeeId = createId("recipient");
    const normalizedWalletAddress = input.walletAddress?.trim()
      ? input.walletAddress.toLowerCase()
      : `pending:${employeeId}`;
    const employee: EmployeeRecord = {
      id: employeeId,
      companyId: this.getCompany().id,
      walletAddress: normalizedWalletAddress,
      name: input.name,
      role: "employee",
      payType: input.payType,
      rateCents: centsFromDollars(input.rate),
      chainPreference: input.chainPreference ?? "Arc",
      destinationChainId: input.destinationChainId ?? chainIdFromPreference(input.chainPreference ?? "Arc", this.config.arcChainId),
      destinationWalletAddress: input.destinationWalletAddress ?? (normalizedWalletAddress.startsWith("0x") ? normalizedWalletAddress : null),
      scheduleId: input.scheduleId ?? this.repository.listSchedules()[0]?.id ?? null,
      timeTrackingMode: input.timeTrackingMode,
      employmentStartDate: input.employmentStartDate ?? currentPeriod.periodStart,
      onboardingStatus: normalizedWalletAddress.startsWith("0x") ? "claimed" : "unclaimed",
      onboardingMethod: normalizedWalletAddress.startsWith("0x") ? "existing_wallet" : null,
      claimedAt: normalizedWalletAddress.startsWith("0x") ? nowIso() : null,
      circleUserId: null,
      circleWalletId: null,
      active: true,
    };
    this.repository.createEmployee(employee);
    return toRecipientResponse(employee);
  }

  updateRecipient(id: string, input: Partial<{
    walletAddress: string | null;
    name: string;
    payType: EmployeeRecord["payType"];
    rate: number;
    chainPreference: string | null;
    destinationChainId: number | null;
    destinationWalletAddress: string | null;
    scheduleId: string | null;
    timeTrackingMode: EmployeeRecord["timeTrackingMode"];
    employmentStartDate: string | null;
    active: boolean;
  }>) {
    const patch: Partial<EmployeeRecord> = {};
    if (input.walletAddress !== undefined) {
      if (input.walletAddress?.trim()) {
        patch.walletAddress = input.walletAddress.toLowerCase();
        patch.destinationWalletAddress = input.destinationWalletAddress ?? input.walletAddress.toLowerCase();
        patch.onboardingStatus = "claimed";
        patch.onboardingMethod = "existing_wallet";
        patch.claimedAt = nowIso();
      }
    }
    if (input.name !== undefined) patch.name = input.name;
    if (input.payType !== undefined) patch.payType = input.payType;
    if (input.rate !== undefined) patch.rateCents = centsFromDollars(input.rate);
    if (input.chainPreference !== undefined) patch.chainPreference = input.chainPreference;
    if (input.destinationChainId !== undefined) patch.destinationChainId = input.destinationChainId;
    if (input.destinationWalletAddress !== undefined) patch.destinationWalletAddress = input.destinationWalletAddress;
    if (input.scheduleId !== undefined) patch.scheduleId = input.scheduleId;
    if (input.timeTrackingMode !== undefined) patch.timeTrackingMode = input.timeTrackingMode;
    if (input.employmentStartDate !== undefined) patch.employmentStartDate = input.employmentStartDate;
    if (input.active !== undefined) patch.active = input.active;
    const updated = requireRecord(this.repository.updateEmployee(id, patch), "Recipient not found.");
    return toRecipientResponse(updated);
  }

  deleteRecipient(id: string) {
    const employee = requireRecord(this.repository.getEmployee(id), "Recipient not found.");
    this.repository.deactivateEmployee(id);
    this.repository.deleteSessionsByAddress(employee.walletAddress);
    this.repository.invalidateActiveInviteCodes(id, nowIso());
    return { ok: true };
  }

  listSchedules() {
    return this.repository.listSchedules().map(toScheduleResponse);
  }

  createSchedule(input: { name: string; timezone: string; startTime: string; hoursPerDay: number; workingDays: number[] }) {
    const schedule: ScheduleRecord = {
      id: createId("schedule"),
      companyId: this.getCompany().id,
      name: input.name,
      timezone: input.timezone,
      startTime: input.startTime,
      hoursPerDay: input.hoursPerDay,
      workingDays: input.workingDays,
    };
    this.repository.createSchedule(schedule);
    return toScheduleResponse(schedule);
  }

  updateSchedule(id: string, input: Partial<{ name: string; timezone: string; startTime: string; hoursPerDay: number; workingDays: number[] }>) {
    const schedule = requireRecord(this.repository.updateSchedule(id, input), "Schedule not found.");
    return toScheduleResponse(schedule);
  }

  listHolidays() {
    return this.repository.listHolidays().map(toHolidayResponse);
  }

  createHoliday(input: { date: string; name: string }) {
    const holiday: HolidayRecord = {
      id: createId("holiday"),
      companyId: this.getCompany().id,
      date: input.date,
      name: input.name,
    };
    this.repository.createHoliday(holiday);
    return toHolidayResponse(holiday);
  }

  updateHoliday(id: string, input: Partial<{ date: string; name: string }>) {
    const holiday = requireRecord(this.repository.updateHoliday(id, input), "Holiday not found.");
    return toHolidayResponse(holiday);
  }

  getProfile(address: string) {
    const employee = this.repository.getEmployeeByWallet(address.toLowerCase());
    const role = address.toLowerCase() === this.config.adminWallet ? "admin" : employee ? "employee" : null;
    return {
      role,
      employee: employee ? toRecipientResponse(employee) : null,
    };
  }

  getEmployeeProfile(id: string) {
    const employee = requireRecord(this.repository.getEmployee(id), "Employee not found.");
    return toRecipientResponse(employee);
  }

  getMeSchedule(address: string) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    const schedule = getSchedule(employee.scheduleId, this.repository.listSchedules());
    return toScheduleResponse(schedule);
  }

  getMeHolidays() {
    return this.listHolidays();
  }

  getTimeOffPolicy() {
    const company = this.getCompany();
    return {
      maxDaysPerYear: company.maxTimeOffDaysPerYear,
      yearStartMonth: 4,
      yearStartDay: 1,
    };
  }

  updateTimeOffPolicy(input: { maxDaysPerYear: number }) {
    const company = this.getCompany();
    company.maxTimeOffDaysPerYear = input.maxDaysPerYear;
    this.repository.updateCompany(company);
    return this.getTimeOffPolicy();
  }

  listMyTimeOff(address: string) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    const requests = this.repository.listTimeOffRequests(employee.id);
    return {
      requests: requests.map((request) => toTimeOffRequestResponse(request, employee)),
      allowance: this.timeOffAllowance(employee),
    };
  }

  listTimeOffRequests() {
    const employees = new Map(this.repository.listEmployees(true).map((employee) => [employee.id, employee]));
    return {
      policy: this.getTimeOffPolicy(),
      requests: this.repository
        .listTimeOffRequests()
        .map((request) => toTimeOffRequestResponse(request, employees.get(request.employeeId) ?? null)),
    };
  }

  createMyTimeOff(address: string, input: { date: string; note?: string | null }) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    this.validateTimeOffDate(employee, input.date);
    this.assertTimeOffWithinLimit(employee, input.date);

    const now = nowIso();
    const request: TimeOffRequestRecord = {
      id: createId("timeoff"),
      companyId: employee.companyId,
      employeeId: employee.id,
      date: input.date,
      note: input.note?.trim() || null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
    };
    this.repository.createTimeOffRequest(request);
    return toTimeOffRequestResponse(request, employee);
  }

  updateMyTimeOff(address: string, id: string, input: Partial<{ date: string; note: string | null; status: "cancelled" }>) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    const current = requireRecord(this.repository.getTimeOffRequest(id), "Time-off request not found.");
    if (current.employeeId !== employee.id) {
      throw new Error("You can only update your own time-off requests.");
    }
    if (current.date < this.getReferenceDate()) {
      throw new Error("Past time-off requests cannot be changed.");
    }

    const patch: Partial<TimeOffRequestRecord> = {
      updatedAt: nowIso(),
    };

    if (input.status === "cancelled") {
      patch.status = "cancelled";
      patch.reviewedAt = current.reviewedAt;
    }

    if (input.date && input.date !== current.date) {
      this.validateTimeOffDate(employee, input.date, id);
      this.assertTimeOffWithinLimit(employee, input.date, id);
      patch.date = input.date;
      patch.status = "pending";
      patch.reviewedAt = null;
    }

    if (input.note !== undefined) {
      patch.note = input.note?.trim() || null;
      if (current.status === "approved" && input.date === undefined) {
        patch.status = "pending";
        patch.reviewedAt = null;
      }
    }

    const updated = requireRecord(this.repository.updateTimeOffRequest(id, patch), "Time-off request not found.");
    return toTimeOffRequestResponse(updated, employee);
  }

  reviewTimeOffRequest(id: string, input: { status: "approved" | "rejected" | "cancelled" }) {
    const current = requireRecord(this.repository.getTimeOffRequest(id), "Time-off request not found.");
    const employee = requireRecord(this.repository.getEmployee(current.employeeId), "Employee not found.");
    if (input.status === "approved") {
      this.validateTimeOffDate(employee, current.date, id);
      this.assertTimeOffWithinLimit(employee, current.date, id);
    }
    const updated = requireRecord(
      this.repository.updateTimeOffRequest(id, {
        status: input.status,
        updatedAt: nowIso(),
        reviewedAt: nowIso(),
      }),
      "Time-off request not found.",
    );
    return toTimeOffRequestResponse(updated, employee);
  }

  getMyTimeEntries(address: string, start?: string, end?: string) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    return this.repository.listTimeEntries(employee.id, start, end).map(toTimeEntryResponse);
  }

  getEmployeeTimeEntries(id: string, start?: string, end?: string) {
    requireRecord(this.repository.getEmployee(id), "Employee not found.");
    return this.repository.listTimeEntries(id, start, end).map(toTimeEntryResponse);
  }

  clockIn(address: string, input?: { date?: string; clockIn?: string }) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    if (employee.timeTrackingMode !== "check_in_out") {
      throw new Error("Employee is configured for schedule-based tracking.");
    }
    const date = input?.date ?? this.getReferenceDate();
    if (this.repository.getOpenTimeEntry(employee.id)) {
      throw new Error("Employee is already clocked in.");
    }
    const timeEntries = this.repository.listTimeEntries(employee.id, date, date);
    const entry: TimeEntryRecord = {
      id: createId("time"),
      employeeId: employee.id,
      date,
      clockIn: input?.clockIn ?? suggestClockInTime(employee.id, date, timeEntries),
      clockOut: null,
      createdAt: `${date}T${isoClock()}:00.000Z`,
    };
    this.repository.createTimeEntry(entry);
    return toTimeEntryResponse(entry);
  }

  clockOut(address: string, input?: { clockOut?: string }) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    if (employee.timeTrackingMode !== "check_in_out") {
      throw new Error("Employee is configured for schedule-based tracking.");
    }
    const openEntry = requireRecord(this.repository.getOpenTimeEntry(employee.id), "No active time entry to close.");
    const entriesToday = this.repository.listTimeEntries(employee.id, openEntry.date, openEntry.date);
    const clockOut = input?.clockOut ?? suggestClockOutTime(employee.id, openEntry.date, entriesToday, openEntry.clockIn);
    const updated = requireRecord(this.repository.closeTimeEntry(openEntry.id, clockOut), "Time entry not found.");
    return toTimeEntryResponse(updated);
  }

  getMyEarnings(address: string) {
    const employee = requireRecord(this.repository.getEmployeeByWallet(address.toLowerCase()), "Employee not found.");
    return this.getEmployeeEarnings(employee.id);
  }

  getEmployeeEarnings(id: string) {
    const employee = requireRecord(this.repository.getEmployee(id), "Employee not found.");
    const payRuns = this.repository.listPayRuns();
    const payRunItems = this.repository.listPayRunItems();
    const withdrawals = this.repository.listWithdrawals(employee.id);
    const schedules = this.repository.listSchedules();
    const holidays = this.repository.listHolidays();
    const approvedTimeOffRequests = this.approvedTimeOffRequests(employee.id);
    const timeEntries = this.repository.listTimeEntries(employee.id);
    const metrics = calculateRecipientMetrics(
      employee,
      payRuns,
      payRunItems,
      withdrawals,
      schedules,
      holidays,
      approvedTimeOffRequests,
      timeEntries,
      this.getReferenceNow(),
      this.getReferenceDate(),
    );
    const currentPeriod = currentSemimonthlyPeriod(this.getReferenceDate());

    return {
      employee: toRecipientResponse(employee),
      currentPeriod: {
        start: currentPeriod.periodStart,
        end: currentPeriod.periodEnd,
        earned: dollarsFromCents(metrics.currentPeriodEarnedCents),
      },
      ytdEarned: dollarsFromCents(metrics.ytdEarnedCents),
      alreadyPaid: dollarsFromCents(metrics.totalPaidCents),
      availableToWithdraw: dollarsFromCents(metrics.availableToWithdrawCents),
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

  async withdrawAvailableEarnings(address: string, input?: { amount?: number }) {
    const normalizedAddress = address.toLowerCase();
    const employee = requireRecord(this.repository.getEmployeeByWallet(normalizedAddress), "Employee not found.");
    const payRuns = this.repository.listPayRuns();
    const payRunItems = this.repository.listPayRunItems();
    const withdrawals = this.repository.listWithdrawals(employee.id);
    const schedules = this.repository.listSchedules();
    const holidays = this.repository.listHolidays();
    const approvedTimeOffRequests = this.approvedTimeOffRequests(employee.id);
    const timeEntries = this.repository.listTimeEntries(employee.id);
    const metrics = calculateRecipientMetrics(
      employee,
      payRuns,
      payRunItems,
      withdrawals,
      schedules,
      holidays,
      approvedTimeOffRequests,
      timeEntries,
      this.getReferenceNow(),
      this.getReferenceDate(),
    );

    if (metrics.availableToWithdrawCents <= 0) {
      throw new Error("No earned wages are available to withdraw.");
    }

    const requestedAmountCents =
      input?.amount !== undefined ? centsFromDollars(input.amount) : metrics.availableToWithdrawCents;
    if (requestedAmountCents <= 0) {
      throw new Error("Withdrawal amount must be greater than zero.");
    }
    if (requestedAmountCents > metrics.availableToWithdrawCents) {
      throw new Error("Requested withdrawal exceeds the available earned balance.");
    }

    await this.ensureLiquidity(requestedAmountCents);
    const txHash = await this.chainService.transferPayroll(normalizedAddress as `0x${string}`, requestedAmountCents);
    const { periodStart, periodEnd } = currentSemimonthlyPeriod(this.getReferenceDate());
    const withdrawal: WithdrawalRecord = {
      id: createId("withdrawal"),
      employeeId: employee.id,
      walletAddress: normalizedAddress,
      amountCents: requestedAmountCents,
      txHash,
      periodStart,
      periodEnd,
      createdAt: nowIso(),
      status: "paid",
    };
    this.repository.createWithdrawal(withdrawal);

    if (this.config.chainMode !== "live") {
      const hub = this.getHubBalance();
      hub.usdcCents -= requestedAmountCents;
      this.repository.updateTreasuryBalance(hub.chainId, hub.usdcCents);
    }

    return {
      ok: true,
      txHash,
      amount: dollarsFromCents(requestedAmountCents),
      walletAddress: normalizedAddress,
    };
  }

  private async buildPayRunItems(periodStart: string, periodEnd: string, employeeIds?: string[]) {
    const employees = (employeeIds?.length
      ? employeeIds.map((employeeId) => requireRecord(this.repository.getEmployee(employeeId), `Employee ${employeeId} not found.`))
      : this.repository.listEmployees()
    ).filter(
      (employee) =>
        employee.active &&
        employee.onboardingStatus === "claimed" &&
        Boolean(publicWalletAddress(employee.destinationWalletAddress) ?? publicWalletAddress(employee.walletAddress)),
    );
    const payRuns = this.repository.listPayRuns();
    const payRunItems = this.repository.listPayRunItems();
    const withdrawals = this.repository.listWithdrawals();
    const schedules = this.repository.listSchedules();
    const holidays = this.repository.listHolidays();
    const approvedTimeOffRequests = this.approvedTimeOffRequests();
    const timeEntries = employees.flatMap((employee) => this.repository.listTimeEntries(employee.id));
    const previews = buildPayRunItemsPreview(
      employees,
      payRuns,
      payRunItems,
      withdrawals,
      schedules,
      holidays,
      approvedTimeOffRequests,
      timeEntries,
      periodStart,
      periodEnd,
      this.getReferenceNow(),
      this.getReferenceDate(),
      this.config.arcChainId,
    ).filter((item) => item.amountCents > 0);

    return Promise.all(previews.map((item) => this.chainService.preparePayRunItem(item)));
  }

  private createPayRunItemsRecords(payRunId: string, previews: PayRunItemPreview[]): PayRunItemRecord[] {
    return previews.map((item, index) => ({
      id: `${payRunId}-item-${index + 1}`,
      payRunId,
      employeeId: item.employeeId,
      recipientWalletAddress: item.recipientWalletAddress,
      destinationChainId: item.destinationChainId,
      amountCents: item.amountCents,
      maxFeeBaseUnits: item.maxFeeBaseUnits,
      minFinalityThreshold: item.minFinalityThreshold,
      useForwarder: item.useForwarder,
      bridgeNonce: null,
      status: item.status,
      txHash: null,
    }));
  }

  listPayRuns() {
    return this.repository.listPayRuns().map((payRun) => toPayRunResponse(payRun, this.repository.listPayRunItems(payRun.id)));
  }

  getPayRun(id: string) {
    const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
    return toPayRunResponse(payRun, this.repository.listPayRunItems(id));
  }

  async createPayRun(input: { periodStart: string; periodEnd: string; employeeIds?: string[] }) {
    const previews = await this.buildPayRunItems(input.periodStart, input.periodEnd, input.employeeIds);
    if (previews.length === 0) {
      throw new Error("Add at least one active recipient before creating a treasury pay run.");
    }
    const payRunId = createId("payrun");
    const now = nowIso();
    const payRun: PayRunRecord = {
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

  async updatePayRun(id: string, input: Partial<{ periodStart: string; periodEnd: string; employeeIds: string[] }>) {
    const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
    if (payRun.status === "executed") throw new Error("Executed pay runs cannot be edited.");

    const periodStart = input.periodStart ?? payRun.periodStart;
    const periodEnd = input.periodEnd ?? payRun.periodEnd;
    const previews = await this.buildPayRunItems(periodStart, periodEnd, input.employeeIds);
    if (previews.length === 0) {
      throw new Error("A treasury pay run must contain at least one active recipient.");
    }
    const items = this.createPayRunItemsRecords(id, previews);
    const updated = requireRecord(this.repository.updatePayRun(id, {
      periodStart,
      periodEnd,
      totalAmountCents: previews.reduce((total, item) => total + item.amountCents, 0),
      updatedAt: nowIso(),
    }), "Pay run not found.");
    this.repository.replacePayRunItems(id, items);
    return toPayRunResponse(updated, items);
  }

  async approvePayRun(id: string) {
    const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
    if (payRun.status !== "draft") throw new Error("Only draft pay runs can be approved.");
    const employeeIds = this.repository.listPayRunItems(id).map((item) => item.employeeId);
    const refreshedPreviews = await this.buildPayRunItems(payRun.periodStart, payRun.periodEnd, employeeIds);
    if (refreshedPreviews.length === 0) {
      throw new Error("A treasury pay run must contain at least one payable recipient before approval.");
    }
    const refreshedItems = this.createPayRunItemsRecords(id, refreshedPreviews);
    this.repository.replacePayRunItems(id, refreshedItems);
    const refreshedPayRun = requireRecord(this.repository.updatePayRun(id, {
      totalAmountCents: refreshedPreviews.reduce((total, item) => total + item.amountCents, 0),
      updatedAt: nowIso(),
    }), "Pay run not found.");

    const onChainId = refreshedPayRun.onChainId ?? await this.chainService.createPayRun({
      payRun: refreshedPayRun,
      items: refreshedItems,
    });
    for (const item of refreshedItems) {
      this.repository.updatePayRunItem(item.id, {
        status: "ready",
      });
    }

    const updated = requireRecord(this.repository.updatePayRun(id, {
      onChainId,
      status: "approved",
      totalAmountCents: refreshedPayRun.totalAmountCents,
      updatedAt: nowIso(),
    }), "Pay run not found.");
    return toPayRunResponse(updated, this.repository.listPayRunItems(id));
  }

  private async ensureLiquidity(requiredCents: number) {
    const company = this.getCompany();

    if (this.config.chainMode === "live") {
      const snapshot = await this.chainService.getTreasurySnapshot();
      if (!snapshot) return null;

      const treasuryUsdcCents = usdcBaseUnitsToCents(snapshot.treasuryUsdcBaseUnits);
      if (treasuryUsdcCents >= requiredCents) return null;
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
    if (hub.usdcCents >= requiredCents) return null;
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

  async executePayRun(id: string) {
    const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
    if (payRun.status !== "approved") throw new Error("Only approved pay runs can be executed.");
    const items = this.repository.listPayRunItems(id);

    await this.ensureLiquidity(payRun.totalAmountCents);

    const onChainId = payRun.onChainId ?? await this.chainService.createPayRun({ payRun, items });
    const execution = await this.chainService.executePayRun({
      ...payRun,
      onChainId,
    }, items);
    const hasCrossChainItems = items.some((item) => item.destinationChainId !== ARC_TESTNET_CCTP_DOMAIN);

    if (this.config.chainMode !== "live") {
      const hub = this.getHubBalance();
      hub.usdcCents -= payRun.totalAmountCents;
      this.repository.updateTreasuryBalance(hub.chainId, hub.usdcCents);
    }

    for (const item of items) {
      const isArcItem = item.destinationChainId === ARC_TESTNET_CCTP_DOMAIN;
      const crossChainMessage = execution.crossChainMessages.find((message) => message.itemId === item.id);
      this.repository.updatePayRunItem(item.id, {
        status: isArcItem ? "paid" : "processing",
        txHash: execution.txHash,
        bridgeNonce: isArcItem ? null : crossChainMessage?.nonce ?? null,
      });
    }

    const updated = requireRecord(this.repository.updatePayRun(id, {
      onChainId: execution.onChainId,
      status: hasCrossChainItems ? "processing" : "executed",
      executedAt: hasCrossChainItems ? null : nowIso(),
      txHash: execution.txHash,
      updatedAt: nowIso(),
    }), "Pay run not found.");

    return toPayRunResponse(updated, this.repository.listPayRunItems(id));
  }

  async finalizePayRun(id: string) {
    const payRun = requireRecord(this.repository.getPayRun(id), "Pay run not found.");
    if (payRun.status !== "processing") throw new Error("Only processing pay runs can be finalized.");

    const items = this.repository.listPayRunItems(id);
    const result = await this.chainService.finalizePayRun(payRun, items);

    for (const update of result.itemUpdates) {
      this.repository.updatePayRunItem(update.itemId, {
        status: update.status,
        txHash: update.txHash,
      });
    }

    const updated = requireRecord(this.repository.updatePayRun(id, {
      status: result.status,
      executedAt: result.status === "executed" ? nowIso() : null,
      updatedAt: nowIso(),
      txHash: result.txHash ?? payRun.txHash,
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
              rebalanceThreshold: dollarsFromCents(company.rebalanceThresholdCents),
              payoutNoticeHours: company.payoutNoticeHours,
            },
            source: "chain" as const,
            treasuryAddress: snapshot.coreAddress,
            controllerAddress: snapshot.controllerAddress,
            usycCustodyAddress: snapshot.controllerAddress,
            payRunAddress: snapshot.payRunAddress,
            rebalanceAddress: snapshot.rebalanceAddress,
            readError: null,
          };
        }
      } catch (error) {
        return this.getStoredTreasuryResponse(error instanceof Error ? error.message : "Live Arc RPC read failed.");
      }
    }

    return toTreasuryResponse(this.repository.listTreasuryBalances(), company);
  }

  async manualRebalance(input: { direction: "usdc_to_usyc" | "usyc_to_usdc"; amount: number }) {
    const amountCents = centsFromDollars(input.amount);
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
      if (hub.usdcCents < amountCents) throw new Error("Insufficient USDC in treasury.");
      txHash = await this.chainService.rebalanceUsdcToUsyc(amountCents);
      hub.usdcCents -= amountCents;
      company.treasuryUsycCents += amountCents;
    } else {
      if (company.treasuryUsycCents < amountCents) throw new Error("Insufficient USYC in treasury.");
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

  updateAutoPolicy(input: Partial<{
    autoRebalanceEnabled: boolean;
    autoRedeemEnabled: boolean;
    rebalanceThreshold: number;
    payoutNoticeHours: number;
  }>) {
    const company = this.getCompany();
    if (input.autoRebalanceEnabled !== undefined) company.autoRebalanceEnabled = input.autoRebalanceEnabled;
    if (input.autoRedeemEnabled !== undefined) company.autoRedeemEnabled = input.autoRedeemEnabled;
    if (input.rebalanceThreshold !== undefined) company.rebalanceThresholdCents = centsFromDollars(input.rebalanceThreshold);
    if (input.payoutNoticeHours !== undefined) company.payoutNoticeHours = input.payoutNoticeHours;
    this.repository.updateCompany(company);
    return toTreasuryResponse(this.repository.listTreasuryBalances(), company).autoPolicy;
  }

  listPolicies() {
    return this.repository.listPolicies().map(toPolicyResponse);
  }

  createPolicy(input: { name: string; type: PolicyRecord["type"]; status?: PolicyRecord["status"]; config?: Record<string, unknown> }) {
    const policy: PolicyRecord = {
      id: createId("policy"),
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

  updatePolicy(id: string, input: Partial<{ name: string; type: PolicyRecord["type"]; status: PolicyRecord["status"]; config: Record<string, unknown>; lastRunAt: string | null }>) {
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
      amount: dollarsFromCents(idleAmount),
    });
    return { ran: true, txHash: result.txHash, amount: dollarsFromCents(idleAmount) };
  }

  async runPolicyEngine() {
    const today = this.getReferenceDate();
    const { periodStart, periodEnd } = currentSemimonthlyPeriod(today);
    const existing = this.repository.listPayRuns().find((payRun) => payRun.periodStart === periodStart && payRun.periodEnd === periodEnd);
    if (existing) {
      return { created: false, payRunId: existing.id };
    }
    const policy = this.repository.listPolicies().find((entry) => entry.type === "payday" && entry.status === "active");
    if (!policy) {
      return { created: false, payRunId: null };
    }

    const payRun = await this.createPayRun({ periodStart, periodEnd });
    this.repository.updatePolicy(policy.id, { lastRunAt: nowIso() });
    return { created: true, payRunId: payRun.id };
  }
}
