"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "@/components/Card";
import { useAuthSession } from "@/components/AuthProvider";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { publicConfig } from "@/lib/publicConfig";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function dashboardHref(role: ReturnType<typeof useAuthSession>["role"]) {
  return role === "admin" ? "/" : "/my-earnings";
}

export default function SignInPage() {
  const {
    token,
    role,
    employee,
    circleAuth,
    sessionKind,
    signIn,
    signOut,
    isAuthenticating,
    error,
  } = useAuthSession();
  const circleGoogleEnabled = Boolean(publicConfig.circleAppId && publicConfig.circleGoogleClientId);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-700">Arc Payroll</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Sign In</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Choose an existing EVM wallet or use Circle Google sign-in. Your payroll session stays active until you sign out here.
            </p>
          </div>
          <Link href="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
            Back to app
          </Link>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Current Session</h2>
              {token ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Signed in as{" "}
                    <span className="font-semibold text-slate-900">
                      {role === "admin" ? "CEO / Admin" : employee?.name ?? "Employee"}
                    </span>
                    .
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Method: {sessionKind === "wallet" ? "Connected EVM wallet" : employee?.onboardingMethod === "circle" ? "Circle Google wallet" : "Employee session"}
                  </p>
                  {employee?.walletAddress && (
                    <p className="mt-1 text-xs text-slate-500">Payroll wallet: {employee.walletAddress}</p>
                  )}
                  {employee?.onboardingMethod === "circle" && !circleAuth && (
                    <p className="mt-2 text-xs text-amber-700">
                      Circle wallet actions need a fresh Circle session in this browser. Use the Circle sign-in option below to reconnect.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No payroll session is active.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {token && (
                <>
                  <Link
                    href={dashboardHref(role)}
                    className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                  >
                    Open Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Existing EVM Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use RainbowKit, MetaMask, or another injected wallet, then sign the payroll challenge.
            </p>

            <div className="mt-4">
              <ConnectButton.Custom>
                {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;
                  const wrongChain = Boolean(chain?.unsupported) || chain?.id !== ARC_TESTNET_CHAIN_ID;

                  if (!ready) {
                    return <div className="h-11 w-full animate-pulse rounded-lg bg-slate-100" aria-hidden />;
                  }

                  return (
                    <div className="space-y-3">
                      {!connected ? (
                        <button
                          type="button"
                          onClick={() => openConnectModal()}
                          className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Connect Wallet
                        </button>
                      ) : wrongChain ? (
                        <button
                          type="button"
                          onClick={() => openChainModal()}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                        >
                          Switch to Arc Testnet
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openAccountModal()}
                            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            Connected: {shortAddress(account.address)}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void signIn();
                            }}
                            disabled={Boolean(token) || isAuthenticating}
                            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {isAuthenticating ? "Signing In…" : token ? "Already Signed In" : "Sign In with Wallet"}
                          </button>
                        </>
                      )}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Circle Google Wallet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Employees who onboarded through Circle can sign in with Google and use their Circle-managed Arc wallet.
            </p>
            <div className="mt-4 space-y-3">
              {circleGoogleEnabled ? (
                <Link
                  href="/circle-login?returnTo=/my-earnings"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-teal-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800"
                >
                  Continue with Google
                </Link>
              ) : (
                <div className="inline-flex w-full items-center justify-center rounded-lg bg-slate-300 px-4 py-3 text-sm font-medium text-white">
                  Continue with Google
                </div>
              )}
              {!circleGoogleEnabled && (
                <p className="text-xs text-amber-700">
                  Add `NEXT_PUBLIC_CIRCLE_APP_ID` and `NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID` to `frontend/.env.local`, then restart the frontend.
                </p>
              )}
            </div>
          </Card>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50/40 p-4">
            <p className="text-sm font-semibold text-red-800">{error}</p>
          </Card>
        )}
      </div>
    </main>
  );
}
