"use client";

import { useState } from "react";
import { mockRecipients } from "@/lib/mockRecipients";
import type { PayType, TimeTrackingMode } from "@/lib/mockTypes";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

function payTypeVariant(p: PayType): "info" | "default" | "warning" {
  if (p === "yearly") return "info";
  if (p === "daily") return "warning";
  return "default";
}
function payTypeLabel(p: PayType) {
  return p === "yearly" ? "Salary" : p === "daily" ? "Daily" : "Hourly";
}
function trackingLabel(t: TimeTrackingMode) {
  return t === "check_in_out" ? "Check-in/out" : "Schedule";
}
function formatRate(p: PayType, rate: number) {
  if (p === "yearly") return `$${rate.toLocaleString()}/yr`;
  if (p === "daily") return `$${rate}/day`;
  return `$${rate}/hr`;
}

export default function RecipientsPage() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {mockRecipients.length} active recipients across {new Set(mockRecipients.map(r => r.chainPreference).filter(Boolean)).size} chains
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Recipient
        </button>
      </div>

      {showAdd && (
        <Card className="border-blue-200 bg-blue-50/30 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Add New Recipient</h3>
              <p className="mt-1 text-sm text-slate-500">
                Enter the employee&rsquo;s name, wallet address, pay type, rate, preferred chain, and time tracking mode.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input type="text" placeholder="Full name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <input type="text" placeholder="Wallet address (0x…)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option>Yearly salary</option>
                  <option>Daily rate</option>
                  <option>Hourly rate</option>
                </select>
                <input type="number" placeholder="Rate ($)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option>Arc</option>
                  <option>Ethereum</option>
                  <option>Base</option>
                  <option>Arbitrum</option>
                </select>
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option>Schedule-based</option>
                  <option>Check-in / Check-out</option>
                </select>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                  Save Recipient
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Wallet</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Rate</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mockRecipients.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {r.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{r.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-400">
                    {r.walletAddress.slice(0, 6)}…{r.walletAddress.slice(-4)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <Badge variant={payTypeVariant(r.payType)}>{payTypeLabel(r.payType)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-medium text-slate-900">
                    {formatRate(r.payType, r.rate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-slate-600">{r.chainPreference ?? "—"}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-500">
                    {trackingLabel(r.timeTrackingMode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
