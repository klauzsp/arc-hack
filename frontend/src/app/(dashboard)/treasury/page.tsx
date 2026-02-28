"use client";

import { useAccount } from "wagmi";
import { useState } from "react";
import { usePayroll } from "@/components/PayrollProvider";
import { useAuthSession } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
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
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-emerald-600" : "bg-slate-300"
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
  const { isConnected, address } = useAccount();
  const { role } = useAuthSession();
  const { treasury, loading, error, rebalanceTreasury, updateAutoPolicy } = usePayroll();
  const [rebalanceMessage, setRebalanceMessage] = useState<string | null>(null);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const isCeo = role === "admin";

  if (loading && !treasury) {
    return <div className="text-sm text-slate-500">Loading treasury…</div>;
  }

  const chainBalances = treasury?.chainBalances ?? [];
  const totalUsdc = treasury?.totalUsdc ?? 0;
  const totalUsyc = treasury?.totalUsyc ?? 0;
  const autoPolicy = treasury?.autoPolicy;
  const showFallbackWarning = Boolean(treasury?.readError);

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
      <p className="text-sm text-slate-500">
        Treasury funds live in the Core contract on Arc Testnet. The CEO can fund the treasury from the wallet, move idle reserves through the Teller-backed USYC flow, and payroll executes out of treasury.
      </p>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Treasury Wiring</h3>
            <p className="mt-1 text-xs text-slate-500">
              Live mode uses the deployed Arc contracts and on-chain balances. USYC custody currently sits with the CEO wallet because the Teller flow is wallet-whitelisted.
            </p>
          </div>
          <Badge variant={treasury?.source === "chain" ? "success" : "default"}>
            {treasury?.source === "chain" ? "On-chain" : "Backend snapshot"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Core Treasury</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{treasury?.treasuryAddress ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Controller</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{treasury?.controllerAddress ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">USYC Custody</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{treasury?.usycCustodyAddress ?? "—"}</p>
          </div>
        </div>
      </Card>

      {showFallbackWarning && (
        <Card className="border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-800">Live treasury read failed. Showing stored snapshot data instead.</p>
          <p className="mt-1 break-words text-xs text-amber-700">{treasury?.readError}</p>
        </Card>
      )}

      {/* KPI cards */}
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

      {/* Auto capital banner */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Auto Capital Management</p>
              <p className="text-xs text-slate-600">
                Idle USDC is automatically converted to USYC for yield. Redeemed back to USDC when needed for payroll or bills.
              </p>
            </div>
          </div>
          <Badge variant={autoPolicy?.autoRebalanceEnabled ? "success" : "warning"}>
            {autoPolicy?.autoRebalanceEnabled ? "Active" : "Paused"}
          </Badge>
        </div>
        {role === "admin" && autoPolicy && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
          <p className={`mt-3 text-sm font-medium ${policyError ? "text-red-700" : "text-emerald-700"}`}>
            {policyError || policyMessage}
          </p>
        )}
      </Card>

      {(error || rebalanceError || rebalanceMessage) && (
        <Card className={`${rebalanceError || error ? "border-red-200 bg-red-50/40" : "border-emerald-200 bg-emerald-50/40"} p-4`}>
          <p className={`text-sm font-semibold ${rebalanceError || error ? "text-red-800" : "text-emerald-800"}`}>
            {rebalanceError || error || rebalanceMessage}
          </p>
        </Card>
      )}

      {/* Chain balances */}
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Balances by Chain</h3>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
          {chainBalances.map((c) => {
            const pct = totalUsdc ? Math.round((c.usdcBalance / totalUsdc) * 100) : 0;
            return (
              <div key={c.chainId} className="bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="text-sm font-medium text-slate-700">{c.chainName}</span>
                  </div>
                  <span className="text-xs text-slate-400">{pct}%</span>
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(c.usdcBalance)}</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">Arc Hub serves as the central settlement and routing layer for all cross-chain USDC transfers.</p>
        </div>
      </Card>

      {role === "admin" && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Manual Treasury Actions</h3>
              <p className="mt-1 text-xs text-slate-500">
                Trigger backend-driven conversions using the same CEO wallet Teller flow that the live treasury UI uses.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isRebalancing}
                onClick={() => {
                  setIsRebalancing(true);
                  setRebalanceError(null);
                  setRebalanceMessage(null);
                  void rebalanceTreasury({ direction: "usdc_to_usyc", amount: 25000 })
                    .then((txHash) => setRebalanceMessage(`Converted $25,000 to USYC. Tx: ${txHash}`))
                    .catch((rebalanceActionError: unknown) => {
                      setRebalanceError(rebalanceActionError instanceof Error ? rebalanceActionError.message : "Rebalance failed.");
                    })
                    .finally(() => setIsRebalancing(false));
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                Move $25k to USYC
              </button>
              <button
                type="button"
                disabled={isRebalancing}
                onClick={() => {
                  setIsRebalancing(true);
                  setRebalanceError(null);
                  setRebalanceMessage(null);
                  void rebalanceTreasury({ direction: "usyc_to_usdc", amount: 25000 })
                    .then((txHash) => setRebalanceMessage(`Redeemed $25,000 to USDC. Tx: ${txHash}`))
                    .catch((rebalanceActionError: unknown) => {
                      setRebalanceError(rebalanceActionError instanceof Error ? rebalanceActionError.message : "Redeem failed.");
                    })
                    .finally(() => setIsRebalancing(false));
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Redeem $25k to USDC
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* CEO section */}
      {isConnected && isCeo && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <h2 className="text-base font-semibold text-slate-900">Company Capital (CEO Only)</h2>
          </div>
          <CompanyCapitalBlock />
        </div>
      )}
      {isConnected && !isCeo && (
        <Card className="p-5">
          <div className="flex items-center gap-3 text-slate-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-sm">Company Capital management is restricted to the CEO wallet.</p>
          </div>
        </Card>
      )}
      {!isConnected && (
        <Card className="p-5">
          <div className="flex items-center gap-3 text-slate-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
            <p className="text-sm">Connect your wallet to view Company Capital controls (CEO only).</p>
          </div>
        </Card>
      )}
    </div>
  );
}
