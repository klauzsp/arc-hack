"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { useAuthSession } from "./AuthProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { token, role, sessionKind } = useAuthSession();

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
            {!connected && token && sessionKind === "employee" ? (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Employee Session
                  <span className="hidden text-xs uppercase text-slate-400 sm:inline">
                    {role ?? "Connected"}
                  </span>
              </Link>
            ) : !connected ? (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                Sign In
              </Link>
            ) : wrongChain ? (
              <button
                type="button"
                onClick={() => {
                  openChainModal();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600"
              >
                Switch to Arc
              </button>
            ) : !token ? (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                Finish Sign In
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
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
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
