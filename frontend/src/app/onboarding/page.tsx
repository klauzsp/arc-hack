"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { Card } from "@/components/Card";
import { api, type OnboardingRedeemResponse } from "@/lib/api";
import { useAuthSession } from "@/components/AuthProvider";
import { publicConfig } from "@/lib/publicConfig";

type ClaimMethod = "wallet" | "circle";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { completeSession } = useAuthSession();
  const [code, setCode] = useState(searchParams.get("code")?.toUpperCase() ?? "");
  const [redeemed, setRedeemed] = useState<OnboardingRedeemResponse | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<ClaimMethod>("wallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const nextCode = searchParams.get("code");
    if (nextCode) {
      setCode(nextCode.toUpperCase());
    }
  }, [searchParams]);

  const onboardingUrl = useMemo(
    () => `${publicConfig.appUrl}/onboarding`,
    [],
  );

  const redeemCode = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await api.redeemOnboardingCode(code.trim().toUpperCase());
      setRedeemed(response);
      setSelectedMethod(response.options.circleWallet ? "circle" : "wallet");
    } catch (redeemError) {
      setRedeemed(null);
      setError(redeemError instanceof Error ? redeemError.message : "Failed to redeem access code.");
    } finally {
      setLoading(false);
    }
  };

  const claimWithWallet = async () => {
    if (!address) {
      setError("Connect the wallet you want to use for payroll first.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("Requesting wallet claim challenge…");
    try {
      const normalizedAddress = address.toLowerCase();
      const challenge = await api.createOnboardingWalletChallenge({
        code: code.trim().toUpperCase(),
        address: normalizedAddress,
      });
      setStatus("Waiting for wallet signature…");
      const signature = await signMessageAsync({ message: challenge.message });
      setStatus("Claiming employee account…");
      const session = await api.claimOnboardingWallet({
        code: code.trim().toUpperCase(),
        address: normalizedAddress,
        message: challenge.message,
        signature,
      });
      completeSession(session, "wallet", normalizedAddress);
      router.push("/my-earnings");
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Wallet onboarding failed.");
    } finally {
      setLoading(false);
    }
  };

  const claimWithCircle = async () => {
    setLoading(true);
    setError(null);
    setStatus("Starting Circle wallet provisioning…");
    try {
      const start = await api.startCircleOnboarding(code.trim().toUpperCase());
      const appId = publicConfig.circleAppId ?? start.circle.appId;
      if (!appId) {
        throw new Error("Circle App ID is missing from frontend configuration.");
      }

      if (start.circle.challengeId) {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        const sdk = new W3SSdk({
          appSettings: { appId },
          authentication: {
            userToken: start.circle.userToken,
            encryptionKey: start.circle.encryptionKey,
          },
        });

        setStatus("Complete the Circle wallet setup modal…");
        await new Promise<void>((resolve, reject) => {
          sdk.execute(start.circle.challengeId as string, (sdkError) => {
            if (sdkError) {
              reject(new Error(typeof sdkError === "string" ? sdkError : "Circle wallet setup failed."));
              return;
            }
            resolve();
          });
        });
      }

      setStatus("Finalizing Circle wallet onboarding…");
      const session = await api.completeCircleOnboarding({
        code: code.trim().toUpperCase(),
        userToken: start.circle.userToken,
      });
      completeSession(session, "employee", session.employee?.walletAddress ?? null);
      router.push("/my-earnings");
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Circle onboarding failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-700">Arc Payroll</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Employee onboarding</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Redeem your one-time access code, then choose whether payroll should use your existing wallet or create an Arc wallet through Circle.
            </p>
          </div>
          <Link href="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
            Back to app
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border border-slate-200 bg-white/90 p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label htmlFor="access-code" className="block text-sm font-medium text-slate-700">
                  One-time access code
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="access-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="Enter access code"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => void redeemCode()}
                    disabled={loading}
                    className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {loading && !redeemed ? "Checking…" : "Redeem code"}
                  </button>
                </div>
              </div>

              {redeemed && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Recipient</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">{redeemed.employee.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Code expires {new Date(redeemed.invite.expiresAt).toLocaleString()}.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMethod("wallet")}
                      disabled={!redeemed.options.existingWallet}
                      className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                        selectedMethod === "wallet"
                          ? "border-teal-700 bg-white shadow-sm"
                          : "border-slate-200 bg-white/80 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">Use my existing wallet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Connect an EVM wallet and sign once to claim your payroll account.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMethod("circle")}
                      disabled={!redeemed.options.circleWallet}
                      className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                        selectedMethod === "circle"
                          ? "border-teal-700 bg-white shadow-sm"
                          : "border-slate-200 bg-white/80 hover:border-slate-300"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <p className="text-sm font-semibold text-slate-900">Create Circle wallet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Provision a new Arc wallet through Circle user-controlled wallets for payroll deposits.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {redeemed && selectedMethod === "wallet" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Connected wallet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {address ? shortAddress(address) : "No wallet connected yet."}
                      </p>
                    </div>
                    <ConnectButton />
                  </div>
                  <button
                    type="button"
                    onClick={() => void claimWithWallet()}
                    disabled={loading || !address}
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {loading ? "Claiming…" : "Claim with this wallet"}
                  </button>
                </div>
              )}

              {redeemed && selectedMethod === "circle" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-medium text-slate-900">Circle wallet onboarding</p>
                  <p className="mt-1 text-sm text-slate-500">
                    This creates a new Arc wallet through Circle and binds it to your payroll profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => void claimWithCircle()}
                    disabled={loading}
                    className="mt-4 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {loading ? "Starting…" : "Create Circle wallet"}
                  </button>
                </div>
              )}

              {status && (
                <p className="text-sm text-slate-500">{status}</p>
              )}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </Card>

          <Card className="border border-slate-200 bg-white/90 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">How it works</p>
            <ol className="mt-4 space-y-4 text-sm text-slate-600">
              <li>
                The CEO creates your payroll recipient record and generates a single-use access code from the Recipients page.
              </li>
              <li>
                You redeem that code here and choose your payout setup: an existing wallet you already control or a new Arc wallet created through Circle.
              </li>
              <li>
                Once the claim completes, your employee session is created and you can immediately access <code>/my-earnings</code> and <code>/my-time</code>.
              </li>
            </ol>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Direct link</p>
              <code className="mt-2 block break-all text-xs text-slate-700">{onboardingUrl}</code>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Card className="p-6">
              <p className="text-sm text-slate-500">Loading onboarding…</p>
            </Card>
          </div>
        </main>
      }
    >
      <OnboardingPageContent />
    </Suspense>
  );
}
