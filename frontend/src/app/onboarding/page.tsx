"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { Card } from "@/components/Card";
import { api, type OnboardingProfilePayload, type OnboardingRedeemResponse } from "@/lib/api";
import { getCircleSdkDeviceId } from "@/lib/circleDevice";
import {
  clearCircleGoogleState,
  formatCircleSdkError,
  hasCircleGoogleCallbackHash,
  readCircleGoogleState,
  redirectToCircleGoogleOauth,
  resetCircleGoogleFlow,
  writeCircleGoogleState,
} from "@/lib/circleGoogle";
import { useAuthSession } from "@/components/AuthProvider";
import { publicConfig } from "@/lib/publicConfig";

type ClaimMethod = "wallet" | "circle";
type OnboardingProfileForm = { chainPreference: string };
type CircleLoginResult = { userToken: string; encryptionKey: string };
type CircleChallengeStatus = "COMPLETE" | "IN_PROGRESS" | "PENDING" | "FAILED" | "EXPIRED";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Circle onboarding failed.";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const [profile, setProfile] = useState<OnboardingProfileForm>({ chainPreference: "Arc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const resumedRef = useRef(false);
  const circleGoogleClientId = publicConfig.circleGoogleClientId;
  const circleAppId = publicConfig.circleAppId;
  const circleOnboardingReady = Boolean(circleGoogleClientId && circleAppId);

  useEffect(() => {
    const nextCode = searchParams.get("code");
    if (nextCode) {
      setCode(nextCode.toUpperCase());
    }
  }, [searchParams]);

  useEffect(() => {
    if (!redeemed) return;
    setProfile((current) => ({
      chainPreference: redeemed.employee.chainPreference ?? current.chainPreference ?? "Arc",
    }));
  }, [redeemed]);

  const onboardingUrl = useMemo(
    () => `${publicConfig.appUrl}/onboarding`,
    [],
  );

  const buildProfilePayload = (): OnboardingProfilePayload => {
    return {
      chainPreference: selectedMethod === "circle" ? "Arc" : profile.chainPreference,
    };
  };

  async function completeCircleOnboardingWithRetry(accessCode: string, result: CircleLoginResult) {
    const onboardingProfile = buildProfilePayload();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const session = await api.completeCircleOnboarding({
          code: accessCode,
          userToken: result.userToken,
          profile: onboardingProfile,
        });
        completeSession(
          session,
          "employee",
          session.employee?.walletAddress ?? null,
          { userToken: result.userToken, encryptionKey: result.encryptionKey },
        );
        clearCircleGoogleState();
        router.push("/my-earnings");
        return;
      } catch (completeError) {
        const message = messageFromError(completeError);
        if (!message.toLowerCase().includes("no arc wallet is available yet")) {
          throw completeError;
        }
        lastError = completeError instanceof Error ? completeError : new Error(message);
        if (attempt < 14) {
          setStatus("Finishing Circle wallet creation…");
          await delay(2000);
        }
      }
    }

    throw lastError ?? new Error("Circle wallet is still being created. Please try again in a moment.");
  }

  async function finalizeCircleOnboarding(accessCode: string, result: CircleLoginResult) {
    const onboardingProfile = buildProfilePayload();
    setStatus("Preparing Circle wallet…");
    const prepare = await api.prepareCircleOnboarding({
      code: accessCode,
      userToken: result.userToken,
      profile: onboardingProfile,
    });

    if (prepare.circle.challengeId) {
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk({
        appSettings: {
          appId:
            readCircleGoogleState("onboarding")?.appId ??
            circleAppId ??
            "",
        },
      });
      sdk.setAuthentication({
        userToken: result.userToken,
        encryptionKey: result.encryptionKey,
      });

      setStatus("Creating Circle wallet…");
      const challengeStatus = await new Promise<CircleChallengeStatus | null>((resolve, reject) => {
        sdk.execute(prepare.circle.challengeId as string, (sdkError, challengeResult) => {
          if (sdkError) {
            reject(new Error(formatCircleSdkError(sdkError, "Circle wallet setup failed.")));
            return;
          }
          resolve((challengeResult?.status as CircleChallengeStatus | undefined) ?? null);
        });
      });

      if (challengeStatus === "FAILED" || challengeStatus === "EXPIRED") {
        throw new Error(`Circle wallet setup ended with status ${challengeStatus.toLowerCase()}.`);
      }
      if (challengeStatus === "IN_PROGRESS" || challengeStatus === "PENDING") {
        setStatus("Finishing Circle wallet creation…");
      }
    }

    setStatus("Finalizing Circle wallet onboarding…");
    await completeCircleOnboardingWithRetry(accessCode, result);
  }

  async function attachCircleSdk(pending: NonNullable<ReturnType<typeof readCircleGoogleState>>) {
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    return new W3SSdk(
      {
        appSettings: { appId: pending.appId },
        loginConfigs: {
          deviceToken: pending.deviceToken,
          deviceEncryptionKey: pending.deviceEncryptionKey,
          google: {
            clientId: circleGoogleClientId as string,
            redirectUri: onboardingUrl,
            selectAccountPrompt: true,
          },
        },
      },
      async (sdkError, result) => {
        if (sdkError) {
          clearCircleGoogleState();
          resumedRef.current = false;
          setLoading(false);
          setStatus(null);
          setError(formatCircleSdkError(sdkError, "Circle Google sign-in failed."));
          return;
        }
        if (!result?.userToken || !result.encryptionKey) {
          clearCircleGoogleState();
          resumedRef.current = false;
          setLoading(false);
          setStatus(null);
          setError("Circle did not return a usable Google sign-in session.");
          return;
        }

        try {
          await finalizeCircleOnboarding(pending.code ?? code.trim().toUpperCase(), {
            userToken: result.userToken,
            encryptionKey: result.encryptionKey,
          });
        } catch (claimError) {
          clearCircleGoogleState();
          resumedRef.current = false;
          setLoading(false);
          setStatus(null);
          setError(messageFromError(claimError));
        }
      },
    );
  }

  useEffect(() => {
    if (!circleOnboardingReady || resumedRef.current) return;

    const pending = readCircleGoogleState("onboarding");
    if (!pending) return;
    if (!hasCircleGoogleCallbackHash()) {
      resetCircleGoogleFlow();
      setLoading(false);
      setStatus(null);
      setError(null);
      return;
    }

    resumedRef.current = true;
    setLoading(true);
    setError(null);
    setStatus("Resuming Circle Google sign-in…");

    void attachCircleSdk(pending).catch((resumeError) => {
      clearCircleGoogleState();
      resumedRef.current = false;
      setLoading(false);
      setStatus(null);
      setError(messageFromError(resumeError));
    });
  }, [circleOnboardingReady, circleGoogleClientId, onboardingUrl, code]);

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
        profile: buildProfilePayload(),
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
    if (!circleOnboardingReady) {
      setError("NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID must both be set in frontend configuration.");
      return;
    }

    resumedRef.current = false;
    resetCircleGoogleFlow();
    setLoading(true);
    setError(null);
    setStatus("Getting Circle device ID…");
    try {
      const onboardingProfile = buildProfilePayload();
      const deviceId = await getCircleSdkDeviceId(circleAppId as string);
      setStatus("Requesting Circle onboarding token…");
      const start = await api.startCircleOnboarding({
        code: code.trim().toUpperCase(),
        deviceId,
        profile: onboardingProfile,
      });
      writeCircleGoogleState({
        mode: "onboarding",
        code: code.trim().toUpperCase(),
        appId: start.circle.appId,
        deviceToken: start.circle.deviceToken,
        deviceEncryptionKey: start.circle.deviceEncryptionKey,
        createdAt: Date.now(),
      });
      setStatus("Redirecting browser to Google…");
      redirectToCircleGoogleOauth({
        clientId: circleGoogleClientId as string,
        redirectUri: onboardingUrl,
        selectAccountPrompt: true,
      });
    } catch (claimError) {
      clearCircleGoogleState();
      setLoading(false);
      setStatus(null);
      setError(messageFromError(claimError));
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
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Preset pay</span>
                        <p className="mt-1 font-medium text-slate-900">
                        {redeemed.employee.payType === "yearly"
                          ? `$${redeemed.employee.rate.toLocaleString()}/yr`
                          : redeemed.employee.payType === "daily"
                            ? `$${redeemed.employee.rate}/day`
                            : `$${redeemed.employee.rate}/hr`}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Preset work setup</span>
                      <p className="mt-1 font-medium text-slate-900">
                        {redeemed.employee.timeTrackingMode === "check_in_out" ? "Check-in / Check-out" : "Schedule-based"}
                        {redeemed.employee.scheduleId ? `, ${redeemed.employee.scheduleId}` : ""}
                      </p>
                    </div>
                  </div>

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
                      <p className="text-sm font-semibold text-slate-900">Create Circle wallet with Google</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Sign in with Google, then provision a new Arc wallet through Circle for payroll deposits.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {redeemed && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-medium text-slate-900">Payout setup</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Your name, pay, schedule, tracking mode, and start date were preset by the CEO. Choose how payroll should reach you.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {selectedMethod === "wallet" ? (
                      <select
                        value={profile.chainPreference}
                        onChange={(event) => setProfile((current) => ({ ...current, chainPreference: event.target.value }))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="Arc">Arc</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="Base">Base</option>
                        <option value="Arbitrum">Arbitrum</option>
                      </select>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                        Circle wallet payouts are locked to Arc.
                      </div>
                    )}
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      Start date: {redeemed.employee.employmentStartDate ?? "Set by CEO"}
                    </div>
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
                    This signs you in with Google, creates a new Arc wallet through Circle, and binds it to your payroll profile.
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    This redirects the page to Google first, then returns here for Circle wallet setup.
                  </p>
                  {!circleOnboardingReady && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      Add <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> and <code>NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID</code> to <code>frontend/.env.local</code> before using Circle onboarding.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void claimWithCircle()}
                    disabled={loading || !circleOnboardingReady}
                    className="mt-4 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {loading ? "Starting…" : "Continue with Circle + Google"}
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
                The CEO either creates your full recipient directly, or generates a single-use access code with your preset name and pay from the Recipients page.
              </li>
              <li>
                If you received a code, you redeem it here and choose your payout setup. The CEO-owned work setup stays fixed.
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
