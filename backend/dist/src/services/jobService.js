"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
class JobService {
    payrollService;
    constructor(payrollService) {
        this.payrollService = payrollService;
    }
    async runScheduledTasks() {
        const autoRebalance = await this.payrollService.runAutoRebalanceJob();
        const policyEngine = this.payrollService.runPolicyEngine();
        return { autoRebalance, policyEngine };
    }
}
exports.JobService = JobService;
