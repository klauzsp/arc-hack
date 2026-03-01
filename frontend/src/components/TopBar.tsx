"use client";

import { WalletButton } from "./WalletButton";

export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-[56px] min-w-0 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-[#0d0e0f] px-5 sm:px-6">
      <h1 className="min-w-0 truncate text-[15px] font-bold tracking-tight text-white">{title}</h1>
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
