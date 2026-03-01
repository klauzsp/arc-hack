"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { useAuthSession } from "./AuthProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const base = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all duration-150";
const outline = `${base} border border-white/[0.10] bg-white/[0.06] text-white/80 hover:border-white/20 hover:bg-white/[0.10]`;
const primary = `${base} bg-gradient-to-r from-[#fc72ff] to-[#7b61ff] text-white hover:opacity-90`;
const success = `${base} border border-[#fc72ff]/20 bg-[#fc72ff]/10 text-[#fc72ff] hover:bg-[#fc72ff]/20`;
const warning = `${base} border border-amber-500/20 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25`;

export function WalletButton() {
  const { token, role, sessionKind, signOut } = useAuthSession();

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const wrongChain = Boolean(chain?.unsupported) || chain?.id !== ARC_TESTNET_CHAIN_ID;

        if (!ready) {
          return <div className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" aria-hidden />;
        }

        return (
          <div className="flex items-center gap-1.5">
            {!connected && token && sessionKind === "employee" ? (
              <>
                <Link href="/sign-in" className={outline}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Employee
                </Link>
                <button type="button" onClick={() => signOut()} className={outline}>Sign out</button>
              </>
            ) : !connected && token && sessionKind === "wallet" ? (
              <>
                <button type="button" onClick={() => openConnectModal()} className={outline}>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Reconnect
                </button>
                <button type="button" onClick={() => signOut()} className={outline}>Sign out</button>
              </>
            ) : !connected ? (
              <Link href="/sign-in" className={primary}>Sign in</Link>
            ) : wrongChain ? (
              <>
                <button type="button" onClick={() => openChainModal()} className={warning}>Switch to Arc</button>
                {token && <button type="button" onClick={() => signOut()} className={outline}>Sign out</button>}
              </>
            ) : !token ? (
              <Link href="/sign-in" className={success}>Finish sign in</Link>
            ) : (
              <>
                <button type="button" onClick={() => openAccountModal()} className={outline}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {shortAddress(account.address)}
                  <span className="hidden text-[11px] font-medium text-white/30 sm:inline">{role ?? "connected"}</span>
                </button>
                <button type="button" onClick={() => signOut()} className={outline}>Sign out</button>
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
