"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 pl-14 lg:pl-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 sm:flex">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-slate-600">All chains</span>
        </div>
        <ConnectButton showBalance={false} />
      </div>
    </header>
  );
}
