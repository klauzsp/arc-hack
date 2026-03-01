"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Badge } from "@/components/Badge";
import { Button, buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { subtlePanelStyles } from "@/components/ui";
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
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Access"
          title="Sign in to payroll"
          description="Choose an existing EVM wallet or continue with a Circle-managed Google wallet. Your payroll session stays active until you explicitly sign out."
          meta={
            token ? (
              <>
                <Badge variant="success">
                  {role === "admin" ? "CEO session" : employee?.name ?? "Employee session"}
                </Badge>
                <Badge variant="default">
                  {sessionKind === "wallet"
                    ? "External wallet"
                    : employee?.onboardingMethod === "circle"
                      ? "Circle Google wallet"
                      : "Employee session"}
                </Badge>
              </>
            ) : (
              <Badge variant="warning">No active session</Badge>
            )
          }
          actions={
            <Link href="/" className={buttonStyles({ variant: "outline", size: "md" })}>
              Back to app
            </Link>
          }
        />

        <Card className="p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
                Current session
              </p>
              {token ? (
                <>
                  <p className="mt-3 text-base font-semibold text-white">
                    Signed in as {role === "admin" ? "CEO / Admin" : employee?.name ?? "Employee"}.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/52">
                    Method:{" "}
                    {sessionKind === "wallet"
                      ? "Connected EVM wallet"
                      : employee?.onboardingMethod === "circle"
                        ? "Circle Google wallet"
                        : "Employee session"}
                  </p>
                  {employee?.walletAddress ? (
                    <p className="mt-1 text-sm text-white/40">
                      Payroll wallet: {employee.walletAddress}
                    </p>
                  ) : null}
                  {employee?.onboardingMethod === "circle" && !circleAuth ? (
                    <p className="mt-3 text-sm text-amber-300">
                      Circle wallet actions need a fresh Circle session in this browser. Use the
                      Circle sign-in option below to reconnect.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-white/52">
                  No payroll session is active in this browser.
                </p>
              )}
            </div>

            {token ? (
              <div className="flex flex-wrap gap-2">
                <Link href={dashboardHref(role)} className={buttonStyles({ variant: "primary" })}>
                  Open dashboard
                </Link>
                <Button variant="outline" onClick={() => signOut()}>
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 sm:p-7">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
                  Existing EVM wallet
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  Sign in with MetaMask or another wallet
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/52">
                  Use RainbowKit, MetaMask, or another injected wallet, then sign the payroll
                  challenge once.
                </p>
              </div>

              <div className={`${subtlePanelStyles} p-4`}>
                <ConnectButton.Custom>
                  {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;
                    const wrongChain = Boolean(chain?.unsupported) || chain?.id !== ARC_TESTNET_CHAIN_ID;

                    if (!ready) {
                      return <div className="h-11 w-full animate-pulse rounded-full bg-white/[0.06]" aria-hidden />;
                    }

                    return (
                      <div className="space-y-3">
                        {!connected ? (
                          <Button block variant="secondary" size="lg" onClick={() => openConnectModal()}>
                            Connect wallet
                          </Button>
                        ) : wrongChain ? (
                          <Button block variant="danger" size="lg" onClick={() => openChainModal()}>
                            Switch to Arc Testnet
                          </Button>
                        ) : (
                          <>
                            <Button block variant="secondary" size="lg" onClick={() => openAccountModal()}>
                              Connected: {shortAddress(account.address)}
                            </Button>
                            <Button
                              block
                              variant="success"
                              size="lg"
                              onClick={() => {
                                void signIn();
                              }}
                              disabled={Boolean(token) || isAuthenticating}
                            >
                              {isAuthenticating
                                ? "Signing in..."
                                : token
                                  ? "Already signed in"
                                  : "Sign in with wallet"}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </Card>

          <Card className="p-6 sm:p-7">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/34">
                  Circle Google wallet
                </p>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  Sign in with Google
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/52">
                  Employees who onboarded through Circle can reconnect their managed Arc wallet
                  session here.
                </p>
              </div>

              <div className={`${subtlePanelStyles} p-4`}>
                {circleGoogleEnabled ? (
                  <Link
                    href="/circle-login?returnTo=/my-earnings"
                    className={buttonStyles({ variant: "primary", size: "lg", block: true })}
                  >
                    Continue with Google
                  </Link>
                ) : (
                  <div
                    className={buttonStyles({
                      variant: "ghost",
                      size: "lg",
                      block: true,
                      className: "pointer-events-none text-white/38",
                    })}
                  >
                    Continue with Google
                  </div>
                )}
                {!circleGoogleEnabled ? (
                  <p className="mt-3 text-sm leading-6 text-amber-300">
                    Add <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> and{" "}
                    <code>NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID</code> to{" "}
                    <code>frontend/.env.local</code>, then restart the frontend.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        {error ? (
          <Card className="border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-red-300">{error}</p>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
