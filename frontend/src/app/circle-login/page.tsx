"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/Card";
import { useAuthSession } from "@/components/AuthProvider";
import { api } from "@/lib/api";
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
import { publicConfig } from "@/lib/publicConfig";

type CircleLoginResult = {
  userToken: string;
  encryptionKey: string;
};

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Google sign-in failed.";
}

function CircleLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, employee, sessionKind, circleAuth, completeSession } = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resumedRef = useRef(false);
  const googleClientId = publicConfig.circleGoogleClientId;
  const circleAppId = publicConfig.circleAppId;
  const circleConfigured = Boolean(googleClientId && circleAppId);
  const loginUrl = useMemo(() => `${publicConfig.appUrl}/circle-login`, []);
  const returnTo = searchParams.get("returnTo") || "/my-earnings";

  useEffect(() => {
    if (token && sessionKind === "employee") {
      if (employee?.onboardingMethod !== "circle") {
        router.replace("/my-earnings");
        return;
      }
      if (circleAuth) {
        router.replace(returnTo);
      }
    }
  }, [circleAuth, employee?.onboardingMethod, returnTo, router, sessionKind, token]);

  async function finalizeCircleLogin(result: CircleLoginResult, nextRoute: string) {
    const session = await api.verifyCircleGoogle({ userToken: result.userToken });
    completeSession(
      session,
      "employee",
      session.employee?.walletAddress ?? null,
      { userToken: result.userToken, encryptionKey: result.encryptionKey },
    );
    clearCircleGoogleState();
    router.push(nextRoute);
  }

  async function attachSdk(pending: NonNullable<ReturnType<typeof readCircleGoogleState>>) {
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    const sdk = new W3SSdk(
      {
        appSettings: { appId: pending.appId },
        loginConfigs: {
          deviceToken: pending.deviceToken,
          deviceEncryptionKey: pending.deviceEncryptionKey,
          google: {
            clientId: googleClientId as string,
            redirectUri: loginUrl,
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
          setError(formatCircleSdkError(sdkError, "Google sign-in failed."));
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

        setStatus("Signing you into payroll…");
        try {
          await finalizeCircleLogin({
            userToken: result.userToken,
            encryptionKey: result.encryptionKey,
          }, pending.returnTo ?? "/my-earnings");
        } catch (loginError) {
          clearCircleGoogleState();
          resumedRef.current = false;
          setLoading(false);
          setStatus(null);
          setError(messageFromError(loginError));
        }
      },
    );

    return sdk;
  }

  useEffect(() => {
    if (!circleConfigured || resumedRef.current) return;

    const pending = readCircleGoogleState("auth");
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
    setStatus("Resuming Google sign-in…");

    void attachSdk(pending).catch((resumeError) => {
      clearCircleGoogleState();
      resumedRef.current = false;
      setLoading(false);
      setStatus(null);
      setError(messageFromError(resumeError));
    });
  }, [circleConfigured, googleClientId, loginUrl]);

  async function startGoogleSignIn() {
    if (!circleConfigured) {
      setError("NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID must both be set in frontend configuration.");
      return;
    }

    resumedRef.current = false;
    resetCircleGoogleFlow();
    setLoading(true);
    setError(null);
    setStatus("Getting Circle device ID…");

    try {
      const deviceId = await getCircleSdkDeviceId(circleAppId as string);
      setStatus("Requesting Circle login token…");
      const response = await api.createCircleGoogleDeviceToken({ deviceId });
      const pendingState = {
        mode: "auth" as const,
        returnTo,
        appId: response.circle.appId,
        deviceToken: response.circle.deviceToken,
        deviceEncryptionKey: response.circle.deviceEncryptionKey,
        createdAt: Date.now(),
      };
      writeCircleGoogleState(pendingState);
      setStatus("Redirecting browser to Google…");
      redirectToCircleGoogleOauth({
        clientId: googleClientId as string,
        redirectUri: loginUrl,
        selectAccountPrompt: true,
      });
    } catch (loginError) {
      clearCircleGoogleState();
      setLoading(false);
      setStatus(null);
      setError(messageFromError(loginError));
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_45%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-700">Arc Payroll</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Circle employee sign-in</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Employees who onboarded with a Circle wallet can sign in here with Google and go straight to payroll.
            </p>
          </div>
          <Link href="/sign-in" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
            Back to sign in
          </Link>
        </div>

        <Card className="border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-medium text-slate-900">Google sign-in</p>
              <p className="mt-1 text-sm text-slate-500">
                This only works for employees whose payout wallet was created through Circle onboarding.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                If you are already signed into payroll, this refreshes your Circle wallet session for transfers and other wallet actions.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                This flow redirects the page to Google. It does not open a WalletConnect or RainbowKit modal.
              </p>
            </div>

            {!circleConfigured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Add <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> and <code>NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID</code> to <code>frontend/.env.local</code> and restart the Next.js server.
              </div>
            )}

            <button
              type="button"
              onClick={() => void startGoogleSignIn()}
              disabled={loading || !circleConfigured}
              className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <span className="text-base">G</span>
              {loading ? "Working…" : "Continue with Google"}
            </button>

            {status && <p className="text-sm text-slate-500">{status}</p>}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function CircleLoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <CircleLoginPageContent />
    </Suspense>
  );
}
