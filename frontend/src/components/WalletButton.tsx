"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { useAuthSession } from "./AuthProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const [walletError, setWalletError] = useState<string | null>(null);
  const { token, role, signIn, signOut, isAuthenticating, error } = useAuthSession();
  const displayError = walletError ?? error;

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const wrongChain = Boolean(chain?.unsupported) || chain?.id !== ARC_TESTNET_CHAIN_ID;

        if (!ready) {
          return <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" aria-hidden />;
        }

        return (
          <div className="flex items-center gap-2">
            {!connected ? (
              <button
                type="button"
                onClick={() => {
                  setWalletError(null);
                  openConnectModal();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2m-2 4h14l-1 7H6l-1-7z" />
                </svg>
                Connect Wallet
              </button>
            ) : wrongChain ? (
              <button
                type="button"
                onClick={() => {
                  setWalletError(null);
                  openChainModal();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600"
              >
                Switch to Arc
              </button>
            ) : !token ? (
              <button
                type="button"
                onClick={() => {
                  setWalletError(null);
                  void signIn().catch((signInError) => {
                    setWalletError(signInError instanceof Error ? signInError.message : "Sign-in failed.");
                  });
                }}
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
                  setWalletError(null);
                  openAccountModal();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {shortAddress(account.address)}
                <span className="hidden text-xs uppercase text-slate-400 sm:inline">
                  {role ?? chain.name ?? "Connected"}
                </span>
              </button>
            )}

            {token && connected && !wrongChain && (
              <button
                type="button"
                onClick={() => {
                  setWalletError(null);
                  signOut();
                }}
                className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 lg:inline-flex"
              >
                Sign Out
              </button>
            )}

            {displayError && (
              <span className="hidden max-w-56 text-xs text-red-600 lg:inline">
                {displayError}
              </span>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
