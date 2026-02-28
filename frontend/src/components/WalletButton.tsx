"use client";

import { useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { useAuthSession } from "./AuthProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const [open, setOpen] = useState(false);
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { token, role, signIn, signOut, isAuthenticating, error } = useAuthSession();

  if (isConnected && address) {
    const wrongChain = chainId !== ARC_TESTNET_CHAIN_ID;
    return (
      <div className="flex items-center gap-2">
        {wrongChain ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
            disabled={isSwitchingChain}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {isSwitchingChain ? "Switching..." : "Switch to Arc"}
          </button>
        ) : !token ? (
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={isAuthenticating}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {isAuthenticating ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing In
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-white/80" />
                Sign In
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              signOut();
              disconnect();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {shortAddress(address)}
            <span className="hidden text-xs uppercase text-slate-400 sm:inline">
              {role ?? connector?.name ?? "Connected"}
            </span>
          </button>
        )}
        {error && (
          <span className="hidden max-w-48 text-xs text-red-600 lg:inline">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2m-2 4h14l-1 7H6l-1-7z" />
        </svg>
        Connect Wallet
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Wallets</p>
          </div>
          <div className="space-y-1">
            {connectors.map((availableConnector) => (
              <button
                key={availableConnector.uid}
                type="button"
                disabled={!availableConnector.ready || isPending}
                onClick={() => {
                  connect({ connector: availableConnector, chainId: ARC_TESTNET_CHAIN_ID });
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                <span>{availableConnector.name}</span>
                {!availableConnector.ready && (
                  <span className="text-xs text-slate-400">Unavailable</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
