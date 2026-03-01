"use client";

import { WalletButton } from "./WalletButton";

export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex min-h-[72px] min-w-0 shrink-0 items-center justify-between gap-4 rounded-[28px] border border-white/[0.06] bg-[#131416]/88 px-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur sm:px-6">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/28">Arc Payroll</p>
        <h1 className="mt-1 min-w-0 truncate text-[18px] font-semibold tracking-tight text-white">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[12px] font-medium text-white/40">Arc testnet</span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
        <WalletButton />
      </div>
    </header>
  );
}
