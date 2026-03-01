"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { useAuthSession } from "@/components/AuthProvider";
import { usePayroll } from "@/components/PayrollProvider";

function statusVariant(status: string): "success" | "default" {
  return status === "active" ? "success" : "default";
}

function typeLabel(type: string) {
  if (type === "payday") return "Schedule";
  if (type === "treasury_threshold") return "Treasury";
  return "Manual";
}

function describePolicy(type: string, config: Record<string, unknown>) {
  if (type === "payday") {
    const frequency = typeof config.frequency === "string" ? config.frequency : "custom";
    return `Runs payroll on a ${frequency} cadence and can trigger approval/execution jobs.`;
  }
  if (type === "treasury_threshold") {
    const minimumUsdc = typeof config.minimumUsdc === "number" ? config.minimumUsdc : null;
    return minimumUsdc
      ? `Monitors treasury reserves and reacts when available USDC drops below $${minimumUsdc.toLocaleString()}.`
      : "Monitors treasury reserves and alerts or rebalances when thresholds are crossed.";
  }
  return "Backend-managed operational policy for payroll or treasury workflows.";
}

const inputCls = "w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-[#fc72ff]/50 focus:outline-none focus:ring-1 focus:ring-[#fc72ff]/20";

export default function PoliciesPage() {
  const { role } = useAuthSession();
  const { policies, loading, error, createPolicy, updatePolicy } = usePayroll();
  const [creating, setCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "manual" as "payday" | "treasury_threshold" | "manual",
    status: "active" as "active" | "paused",
  });

  const orderedPolicies = useMemo(
    () => [...policies].sort((left, right) => left.name.localeCompare(right.name)),
    [policies],
  );

  const handleCreate = async () => {
    setIsSaving(true);
    setActionError(null);
    try {
      const config =
        form.type === "payday"
          ? { frequency: "semimonthly", executeAutomatically: false }
          : form.type === "treasury_threshold"
            ? { minimumUsdc: 50000, notifyOnly: true }
            : {};

      await createPolicy({
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        config,
      });
      setForm({ name: "", type: "manual", status: "active" });
      setCreating(false);
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : "Failed to create policy.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (policyId: string, status: "active" | "paused") => {
    setActionError(null);
    try {
      await updatePolicy(policyId, {
        status: status === "active" ? "paused" : "active",
      });
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : "Failed to update policy.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Policies</h2>
          <p className="mt-1 text-sm text-white/50">
            Configure payroll and treasury rules that keep operations consistent across approvals, payout timing, and treasury protection.
          </p>
        </div>
        {role === "admin" && (
          <button
            type="button"
            onClick={() => setCreating((current) => !current)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#fc72ff] px-4 py-2.5 text-sm font-semibold text-[#0d0e0f] shadow-sm transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {creating ? "Close" : "New Policy"}
          </button>
        )}
      </div>

      {(error || actionError) && (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{error || actionError}</p>
        </Card>
      )}

      {creating && role === "admin" && (
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className={inputCls}
                placeholder="Quarter-end hold"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Type</span>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as "payday" | "treasury_threshold" | "manual",
                  }))
                }
                className={inputCls}
              >
                <option value="manual">Manual</option>
                <option value="payday">Payday</option>
                <option value="treasury_threshold">Treasury Threshold</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as "active" | "paused",
                  }))
                }
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={isSaving || form.name.trim().length === 0}
              onClick={() => void handleCreate()}
              className="rounded-xl border border-white/[0.10] bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : "Save Policy"}
            </button>
          </div>
        </Card>
      )}

      {loading && orderedPolicies.length === 0 ? (
        <div className="text-sm text-white/50">Loading policies…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {orderedPolicies.map((policy) => (
            <Card key={policy.id} className="p-6 transition-colors hover:border-white/[0.10]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06]">
                    <svg className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{policy.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={statusVariant(policy.status)}>
                        {policy.status.charAt(0).toUpperCase() + policy.status.slice(1)}
                      </Badge>
                      <Badge>{typeLabel(policy.type)}</Badge>
                    </div>
                  </div>
                </div>
                {role === "admin" && (
                  <button
                    type="button"
                    onClick={() => void handleToggle(policy.id, policy.status)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08]"
                  >
                    {policy.status === "active" ? "Pause" : "Resume"}
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                {describePolicy(policy.type, policy.config)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
