"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { buttonStyles } from "./Button";
import { useAuthSession } from "./AuthProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { token, role, sessionKind, signOut } = useAuthSession();

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const wrongChain = Boolean(chain?.unsupported) || chain?.id !== ARC_TESTNET_CHAIN_ID;

        if (!ready) {
          return <div className="h-10 w-28 animate-pulse rounded-full bg-white/[0.06]" aria-hidden />;
        }

        return (
          <div className="flex items-center gap-2">
            {!connected && token && sessionKind === "employee" ? (
              <>
                <Link href="/sign-in" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Employee
                </Link>
                <button type="button" onClick={() => signOut()} className={buttonStyles({ variant: "outline", size: "sm" })}>Sign out</button>
              </>
            ) : !connected && token && sessionKind === "wallet" ? (
              <>
                <button type="button" onClick={() => openConnectModal()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Reconnect
                </button>
                <button type="button" onClick={() => signOut()} className={buttonStyles({ variant: "outline", size: "sm" })}>Sign out</button>
              </>
            ) : !connected ? (
              <Link href="/sign-in" className={buttonStyles({ variant: "primary", size: "sm" })}>Sign in</Link>
            ) : wrongChain ? (
              <>
                <button type="button" onClick={() => openChainModal()} className={buttonStyles({ variant: "ghost", size: "sm", className: "border-amber-500/20 bg-amber-500/12 text-amber-300 hover:bg-amber-500/18" })}>Switch to Arc</button>
                {token && <button type="button" onClick={() => signOut()} className={buttonStyles({ variant: "outline", size: "sm" })}>Sign out</button>}
              </>
            ) : !token ? (
              <Link href="/sign-in" className={buttonStyles({ variant: "primary", size: "sm" })}>Finish sign in</Link>
            ) : (
              <>
                <button type="button" onClick={() => openAccountModal()} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {shortAddress(account.address)}
                  <span className="hidden text-[11px] font-medium text-white/30 sm:inline">{role ?? "connected"}</span>
                </button>
                <button type="button" onClick={() => signOut()} className={buttonStyles({ variant: "outline", size: "sm" })}>Sign out</button>
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
