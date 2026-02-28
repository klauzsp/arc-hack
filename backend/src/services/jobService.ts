import { PayrollService } from "./payrollService";

export class JobService {
  constructor(private readonly payrollService: PayrollService) {}

  async runScheduledTasks() {
    const autoRebalance = await this.payrollService.runAutoRebalanceJob();
    const policyEngine = this.payrollService.runPolicyEngine();
    return { autoRebalance, policyEngine };
  }
}
