"use client";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

const mockPolicies = [
  {
    name: "Bi-weekly payroll",
    description: "Automatically execute pay runs on the 1st and 16th of each month.",
    status: "active",
    type: "Schedule",
  },
  {
    name: "Low balance alert",
    description: "Notify admin when total USDC treasury drops below $50,000.",
    status: "active",
    type: "Threshold",
  },
  {
    name: "Auto-rebalance",
    description: "Convert idle USDC to USYC when balance exceeds $500,000. Redeem USYC when payroll reserve falls below $100,000.",
    status: "active",
    type: "Treasury",
  },
  {
    name: "Cross-chain settlement",
    description: "Route payouts to recipient's preferred chain via Arc CCTP. Fall back to Arc hub if chain liquidity is insufficient.",
    status: "draft",
    type: "Routing",
  },
];

function statusVariant(s: string): "success" | "default" {
  return s === "active" ? "success" : "default";
}

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Configure automated rules for payroll execution, treasury management, and cross-chain routing.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Policy
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {mockPolicies.map((policy) => (
          <Card key={policy.name} className="p-5 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{policy.name}</h3>
                  <Badge variant={statusVariant(policy.status)}>
                    {policy.status.charAt(0).toUpperCase() + policy.status.slice(1)}
                  </Badge>
                </div>
              </div>
              <Badge>{policy.type}</Badge>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{policy.description}</p>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-slate-50/50 p-5">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-sm text-slate-500">
            Policies run on the backend agent. On-chain hooks are supported for threshold and schedule-based triggers.
            Full policy engine coming with backend integration.
          </p>
        </div>
      </Card>
    </div>
  );
}
