"use client";

import { useAccount } from "wagmi";
import { CEO_ADDRESS } from "@/lib/contracts";
import {
  mockChainBalances,
  mockTotalTreasuryUsdc,
  mockTotalTreasuryUsyc,
} from "@/lib/mockTreasury";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { CompanyCapitalBlock } from "@/components/CompanyCapitalBlock";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function TreasuryPage() {
  const { isConnected, address } = useAccount();
  const isCeo = !!address && address.toLowerCase() === CEO_ADDRESS.toLowerCase();

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Multi-chain USDC treasury with automated yield optimization through USYC.
      </p>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total USDC"
          value={formatCurrency(mockTotalTreasuryUsdc)}
          subtitle="Across all chains"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="USYC Yield"
          value={mockTotalTreasuryUsyc.toLocaleString()}
          subtitle="Earning yield on Arc Hub"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          trend={{ value: "+4.2% APY", positive: true }}
        />
        <StatCard
          label="Total Value"
          value={formatCurrency(mockTotalTreasuryUsdc + mockTotalTreasuryUsyc)}
          subtitle="USDC + USYC combined"
          icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
        <StatCard
          label="Active Chains"
          value={String(mockChainBalances.length)}
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
          <Badge variant="success">Active</Badge>
        </div>
      </Card>

      {/* Chain balances */}
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Balances by Chain</h3>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
          {mockChainBalances.map((c) => {
            const pct = Math.round((c.usdcBalance / mockTotalTreasuryUsdc) * 100);
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
