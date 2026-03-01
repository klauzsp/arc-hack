"use client";

import { useState } from "react";
import { usePayroll } from "@/components/PayrollProvider";
import { useAuthSession } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { CompanyCapitalBlock } from "@/components/CompanyCapitalBlock";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function Toggle({
  enabled,
  disabled,
  label,
  description,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-xs text-white/50">{description}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-white/20"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

export default function TreasuryPage() {
  const { role } = useAuthSession();
  const { treasury, loading, error, updateAutoPolicy } = usePayroll();
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);

  if (loading && !treasury) {
    return <div className="text-sm text-white/50">Loading treasury…</div>;
  }

  const chainBalances = treasury?.chainBalances ?? [];
  const totalUsdc = treasury?.totalUsdc ?? 0;
  const totalUsyc = treasury?.totalUsyc ?? 0;
  const autoPolicy = treasury?.autoPolicy;

  const togglePolicy = async (
    field: "autoRebalanceEnabled" | "autoRedeemEnabled",
    nextValue: boolean,
    label: string,
  ) => {
    setIsSavingPolicy(true);
    setPolicyError(null);
    setPolicyMessage(null);
    try {
      await updateAutoPolicy({ [field]: nextValue });
      setPolicyMessage(`${label} ${nextValue ? "enabled" : "disabled"}.`);
    } catch (toggleError) {
      setPolicyError(toggleError instanceof Error ? toggleError.message : "Failed to update policy.");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Capital Operations"
        title="Treasury"
        description="Keep payroll liquid and let idle cash earn yield. Funds remain available for pay runs across all connected chains."
        meta={<Badge variant="info">{chainBalances.length} connected chains</Badge>}
      />

      {treasury?.readError && (
        <Card className="border-amber-500/20 bg-amber-500/10 p-5">
          <p className="text-sm font-medium text-amber-300">Balances are updating. Please refresh in a moment.</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total USDC"
          value={formatCurrency(totalUsdc)}
          subtitle="Across all chains"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="USYC Yield"
          value={formatCurrency(totalUsyc)}
          subtitle="Earning yield on Arc Hub"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          trend={{ value: "+4.2% APY", positive: true }}
        />
        <StatCard
          label="Total Value"
          value={formatCurrency(totalUsdc + totalUsyc)}
          subtitle="USDC + USYC combined"
          icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
        <StatCard
          label="Active Chains"
          value={String(chainBalances.length)}
          subtitle="With USDC liquidity"
          icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </div>

      <Card className="bg-gradient-to-br from-[#fc72ff]/[0.05] to-[#7b61ff]/[0.05] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Auto capital</p>
            <p className="mt-1 text-sm text-white/60">
              Idle USDC earns yield in USYC. It's converted back to USDC when payroll or bills need it.
            </p>
          </div>
          <Badge variant={autoPolicy?.autoRebalanceEnabled ? "success" : "warning"}>
            {autoPolicy?.autoRebalanceEnabled ? "On" : "Paused"}
          </Badge>
        </div>
        {role === "admin" && autoPolicy && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Toggle
              enabled={autoPolicy.autoRebalanceEnabled}
              disabled={isSavingPolicy}
              label="Auto rebalance idle USDC"
              description="Move idle treasury USDC into USYC when balances sit above the configured threshold."
              onToggle={() => {
                void togglePolicy(
                  "autoRebalanceEnabled",
                  !autoPolicy.autoRebalanceEnabled,
                  "Auto rebalance",
                );
              }}
            />
            <Toggle
              enabled={autoPolicy.autoRedeemEnabled}
              disabled={isSavingPolicy}
              label="Auto redeem for payroll"
              description="Redeem CEO-managed USYC back into treasury USDC when payroll needs liquidity."
              onToggle={() => {
                void togglePolicy(
                  "autoRedeemEnabled",
                  !autoPolicy.autoRedeemEnabled,
                  "Auto redeem",
                );
              }}
            />
          </div>
        )}
        {(policyError || policyMessage) && (
          <p className={`mt-3 text-sm font-medium ${policyError ? "text-red-400" : "text-emerald-400"}`}>
            {policyError || policyMessage}
          </p>
        )}
      </Card>

      {error && (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">
            {error}
          </p>
        </Card>
      )}

      <Card>
        <div className="border-b border-white/[0.06] px-6 py-4">
          <h3 className="text-sm font-semibold text-white">By chain</h3>
        </div>
        <div className="grid gap-px bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-4">
          {chainBalances.map((c) => {
            const pct = totalUsdc ? Math.round((c.usdcBalance / totalUsdc) * 100) : 0;
            return (
              <div key={c.chainId} className="bg-[#131416] px-6 py-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#fc72ff]" />
                    <span className="truncate text-sm font-medium text-white/80">{c.chainName}</span>
                  </div>
                  <span className="shrink-0 text-xs text-white/40">{pct}%</span>
                </div>
                <p className="mt-2 truncate text-xl font-semibold tabular-nums text-white" title={formatCurrency(c.usdcBalance)}>{formatCurrency(c.usdcBalance)}</p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-[#fc72ff] to-[#7b61ff] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {role === "admin" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Company capital</h3>
          <CompanyCapitalBlock />
        </div>
      )}
    </div>
  );
}
