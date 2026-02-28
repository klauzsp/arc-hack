"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { useAuthSession } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { formatCircleSdkError } from "@/lib/circleGoogle";
import { ERC20_ABI, USDC_ADDRESS, arcTestnet, explorerAddressUrl } from "@/lib/contracts";
import { publicConfig } from "@/lib/publicConfig";
import { createPublicClient, formatUnits, http, isAddress, type Address } from "viem";

type CircleChallengeStatus = "COMPLETE" | "IN_PROGRESS" | "PENDING" | "FAILED" | "EXPIRED";

function formatUsdc(value: string | null) {
  if (!value) return "0.00";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Circle wallet action failed.";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ManageWalletPage() {
  const { token, role, employee, circleAuth } = useAuthSession();
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const circleAppId = publicConfig.circleAppId;
  const client = useMemo(
    () =>
      createPublicClient({
        chain: arcTestnet,
        transport: http(publicConfig.arcRpcUrl),
      }),
    [],
  );

  const walletAddress = employee?.walletAddress ?? null;
  const isEligible = role === "employee" && employee?.onboardingMethod === "circle" && walletAddress;

  const loadBalance = async () => {
    if (!walletAddress) return;
    setIsRefreshingBalance(true);
    setBalanceError(null);
    try {
      const nextBalance = await client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as Address],
      });
      setBalance(formatUnits(nextBalance, 6));
    } catch (loadError) {
      setBalanceError(messageFromError(loadError));
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  useEffect(() => {
    if (!isEligible) return;
    void loadBalance();
  }, [isEligible, walletAddress]);

  const handleTransfer = async () => {
    if (!token || !walletAddress || !employee) {
      setError("Sign in as the Circle employee before managing the wallet.");
      return;
    }
    if (!circleAuth) {
      setError("Reconnect your Circle session with Google before sending funds.");
      return;
    }
    if (!circleAppId) {
      setError("NEXT_PUBLIC_CIRCLE_APP_ID is missing from frontend configuration.");
      return;
    }
    if (!isAddress(destinationAddress)) {
      setError("Enter a valid destination wallet address.");
      return;
    }
    if (destinationAddress.toLowerCase() === walletAddress.toLowerCase()) {
      setError("Destination wallet must be different from your payroll wallet.");
      return;
    }
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim()) || Number(amount) <= 0) {
      setError("Enter a positive USDC amount with up to 6 decimals.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus("Preparing Circle transfer challenge…");

    try {
      const transfer = await api.createCircleWalletTransfer(token, {
        userToken: circleAuth.userToken,
        destinationAddress,
        amount: amount.trim(),
      });

      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      const sdk = new W3SSdk({
        appSettings: {
          appId: circleAppId,
        },
      });
      sdk.setAuthentication(circleAuth);

      setStatus("Confirm the Circle wallet transfer…");
      const challengeStatus = await new Promise<CircleChallengeStatus | null>((resolve, reject) => {
        sdk.execute(transfer.challengeId, (sdkError, result) => {
          if (sdkError) {
            reject(new Error(formatCircleSdkError(sdkError, "Circle transfer failed.")));
            return;
          }
          resolve((result?.status as CircleChallengeStatus | undefined) ?? null);
        });
      });

      if (challengeStatus === "FAILED" || challengeStatus === "EXPIRED") {
        throw new Error(`Circle transfer ended with status ${challengeStatus.toLowerCase()}.`);
      }

      setDestinationAddress("");
      setAmount("");
      setStatus(
        challengeStatus === "IN_PROGRESS" || challengeStatus === "PENDING"
          ? `Transfer of ${transfer.amount} ${transfer.symbol} is being finalized to ${transfer.destinationAddress}.`
          : `Transfer of ${transfer.amount} ${transfer.symbol} submitted to ${transfer.destinationAddress}.`,
      );

      await delay(2000);
      await loadBalance();
    } catch (transferError) {
      setError(messageFromError(transferError));
      setStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (role !== "employee" || !employee) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">Sign in as an employee to manage a payout wallet.</p>
      </Card>
    );
  }

  if (employee.onboardingMethod !== "circle") {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900">Circle wallet required</h2>
        <p className="mt-2 text-sm text-slate-500">
          This page is only available for employees whose payout wallet was created through Circle onboarding.
        </p>
      </Card>
    );
  }

  if (!walletAddress) {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">No Circle payout wallet is attached to this employee yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Move live Arc USDC out of your Circle-managed payroll wallet to another wallet address.
          </p>
          <p className="mt-1 text-xs text-slate-400">Transfers run on Arc Testnet and require a live Circle session.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadBalance()}
          disabled={isRefreshingBalance}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isRefreshingBalance ? "Refreshing…" : "Refresh Balance"}
        </button>
      </div>

      {!circleAuth && (
        <Card className="border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">Reconnect Circle</h2>
          <p className="mt-2 text-sm text-amber-800">
            Your payroll session is active, but the Circle wallet session is missing in this browser tab. Reconnect with Google before sending funds.
          </p>
          <Link
            href="/circle-login?returnTo=/manage-wallet"
            className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Reconnect Circle Session
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Wallet Overview</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Employee</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{employee.name}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Wallet Address</p>
              <a
                href={explorerAddressUrl(walletAddress)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                {walletAddress}
              </a>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Available USDC</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">{formatUsdc(balance)} USDC</p>
              <p className="mt-1 text-xs text-slate-400">Live balance from the Arc Testnet USDC contract.</p>
            </div>
          </div>
          {balanceError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {balanceError}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Send Funds</h2>
          <p className="mt-1 text-sm text-slate-500">
            This prepares a Circle wallet transfer challenge, then uses Circle’s SDK to confirm and broadcast it.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Destination Wallet</span>
              <input
                type="text"
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
                placeholder="0x..."
                disabled={isSubmitting || !circleAuth}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Amount (USDC)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="10.50"
                disabled={isSubmitting || !circleAuth}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleTransfer()}
              disabled={isSubmitting || !circleAuth}
              className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "Sending…" : "Send USDC"}
            </button>
          </div>

          {status && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {status}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
