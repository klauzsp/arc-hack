"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { subtlePanelStyles } from "@/components/ui";
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

        setStatus("Signing you into payroll...");
        try {
          await finalizeCircleLogin(
            {
              userToken: result.userToken,
              encryptionKey: result.encryptionKey,
            },
            pending.returnTo ?? "/my-earnings",
          );
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
    setStatus("Resuming Google sign-in...");

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
      setError(
        "NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID must both be set in frontend configuration.",
      );
      return;
    }

    resumedRef.current = false;
    resetCircleGoogleFlow();
    setLoading(true);
    setError(null);
    setStatus("Getting Circle device ID...");

    try {
      const deviceId = await getCircleSdkDeviceId(circleAppId as string);
      setStatus("Requesting Circle login token...");
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
      setStatus("Redirecting browser to Google...");
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
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          eyebrow="Circle Wallet"
          title="Employee Google sign-in"
          description="Employees who onboarded with a Circle wallet can reconnect here with Google and go straight back to payroll."
          actions={
            <Link href="/sign-in" className={buttonStyles({ variant: "outline" })}>
              Back to sign in
            </Link>
          }
        />

        <Card className="p-6 sm:p-8">
          <div className="space-y-5">
            <div className={`${subtlePanelStyles} p-5`}>
              <p className="text-sm font-semibold text-white">Google sign-in</p>
              <p className="mt-2 text-sm leading-6 text-white/52">
                This only works for employees whose payout wallet was created through Circle
                onboarding.
              </p>
              <p className="mt-2 text-sm leading-6 text-white/40">
                If you are already signed into payroll, this refreshes your Circle wallet session
                for transfers and other wallet actions.
              </p>
              <p className="mt-2 text-sm leading-6 text-white/40">
                The flow redirects the page to Google. It does not open a WalletConnect or
                RainbowKit modal.
              </p>
            </div>

            {!circleConfigured ? (
              <Card className="border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-300">
                  Add <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> and{" "}
                  <code>NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID</code> to{" "}
                  <code>frontend/.env.local</code> and restart the Next.js server.
                </p>
              </Card>
            ) : null}

            <Button
              block
              size="lg"
              onClick={() => void startGoogleSignIn()}
              disabled={loading || !circleConfigured}
            >
              <span className="text-base">G</span>
              {loading ? "Working..." : "Continue with Google"}
            </Button>

            {status ? <p className="text-sm text-white/52">{status}</p> : null}
            {error ? (
              <Card className="border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm text-red-300">{error}</p>
              </Card>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function CircleLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <Card className="p-6">
              <p className="text-sm text-white/50">Loading Circle sign-in...</p>
            </Card>
          </div>
        </main>
      }
    >
      <CircleLoginPageContent />
    </Suspense>
  );
}
