"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { useAuthSession } from "@/components/AuthProvider";
import { inputStyles } from "@/components/ui";
import { api } from "@/lib/api";
import { formatCircleSdkError } from "@/lib/circleGoogle";
import { ERC20_ABI, USDC_ADDRESS, arcTestnet, explorerAddressUrl } from "@/lib/contracts";
import { publicConfig } from "@/lib/publicConfig";
import { createPublicClient, formatUnits, http, isAddress, parseUnits, type Address } from "viem";

type CircleChallengeStatus = "COMPLETE" | "IN_PROGRESS" | "PENDING" | "FAILED" | "EXPIRED";

const destinationOptions = [
  { preference: "Arc", label: "Arc Testnet" },
  { preference: "Base", label: "Base Sepolia" },
  { preference: "Arbitrum", label: "Arbitrum Sepolia" },
  { preference: "Ethereum", label: "Ethereum Sepolia" },
  { preference: "Avalanche", label: "Avalanche Fuji" },
] as const;

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
  const [destinationPreference, setDestinationPreference] = useState<(typeof destinationOptions)[number]["preference"]>("Arc");
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
  const destinationLabel =
    destinationOptions.find((option) => option.preference === destinationPreference)?.label ?? "Arc Testnet";

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

  const executeChallenge = async (challengeId: string, pendingStatus: string) => {
    if (!circleAppId || !circleAuth) {
      throw new Error("Reconnect your Circle session with Google before sending funds.");
    }

    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    const sdk = new W3SSdk({
      appSettings: {
        appId: circleAppId,
      },
    });
    sdk.setAuthentication(circleAuth);

    setStatus(pendingStatus);
    const challengeStatus = await new Promise<CircleChallengeStatus | null>((resolve, reject) => {
      sdk.execute(challengeId, (sdkError, result) => {
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

    return challengeStatus;
  };

  const waitForAllowance = async (spenderAddress: string, requiredAmount: bigint) => {
    if (!walletAddress) return false;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const allowance = await client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [walletAddress as Address, spenderAddress as Address],
      });
      if (allowance >= requiredAmount) {
        return true;
      }
      await delay(1500);
    }

    return false;
  };

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
      const normalizedAmount = amount.trim();
      const requiredAmount = parseUnits(normalizedAmount, 6);
      let transfer = await api.createCircleWalletTransfer(token, {
        userToken: circleAuth.userToken,
        destinationAddress,
        amount: normalizedAmount,
        destinationPreference,
      });

      if (transfer.kind === "cctp_approval") {
        await executeChallenge(transfer.challengeId, "Approve Circle wallet for CCTP transfers…");
        if (!transfer.approvalTargetAddress) {
          throw new Error("Approval target is missing for this CCTP transfer.");
        }

        setStatus("Approval submitted. Waiting for Arc allowance update…");
        const allowanceReady = await waitForAllowance(transfer.approvalTargetAddress, requiredAmount);
        if (!allowanceReady) {
          throw new Error("USDC approval is still pending on Arc. Please try the transfer again in a few seconds.");
        }

        transfer = await api.createCircleWalletTransfer(token, {
          userToken: circleAuth.userToken,
          destinationAddress,
          amount: normalizedAmount,
          destinationPreference,
        });
        if (transfer.kind === "cctp_approval") {
          throw new Error("USDC approval is still settling. Please retry the CCTP transfer shortly.");
        }
      }

      const challengeStatus = await executeChallenge(
        transfer.challengeId,
        transfer.kind === "cctp_transfer"
          ? `Confirm the CCTP transfer to ${transfer.destinationChain}…`
          : "Confirm the Circle wallet transfer…",
      );

      setDestinationAddress("");
      setAmount("");
      setDestinationPreference("Arc");
      setStatus(
        transfer.kind === "cctp_transfer"
          ? challengeStatus === "IN_PROGRESS" || challengeStatus === "PENDING"
            ? `CCTP transfer of ${transfer.amount} ${transfer.symbol} to ${transfer.destinationChain} is being finalized. Estimated destination receive amount is ${transfer.estimatedReceivedAmount.toFixed(6)} ${transfer.symbol}.`
            : `CCTP transfer of ${transfer.amount} ${transfer.symbol} submitted to ${transfer.destinationAddress} on ${transfer.destinationChain}. Estimated destination receive amount is ${transfer.estimatedReceivedAmount.toFixed(6)} ${transfer.symbol}.`
          : challengeStatus === "IN_PROGRESS" || challengeStatus === "PENDING"
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
        <p className="text-sm text-white/50">Sign in as an employee to manage a payout wallet.</p>
      </Card>
    );
  }

  if (employee.onboardingMethod !== "circle") {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-white">Circle wallet required</h2>
        <p className="mt-2 text-sm text-white/50">
          This page is only available for employees whose payout wallet was created through Circle onboarding.
        </p>
      </Card>
    );
  }

  if (!walletAddress) {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/50">No Circle payout wallet is attached to this employee yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Circle Wallet"
        title="Manage Wallet"
        description="Send USDC from your payroll wallet to another address or route funds to a different network."
        meta={<span className="text-xs text-white/40">Transfers run on Arc Testnet and require a live Circle session.</span>}
        actions={
          <Button
            variant="outline"
            onClick={() => void loadBalance()}
            disabled={isRefreshingBalance}
          >
          {isRefreshingBalance ? "Refreshing…" : "Refresh Balance"}
          </Button>
        }
      />

      {!circleAuth && (
        <Card className="border-amber-500/20 bg-amber-500/10 p-5">
          <h2 className="text-sm font-semibold text-amber-300">Reconnect Circle</h2>
          <p className="mt-2 text-sm text-amber-400/80">
            Your payroll session is active, but the Circle wallet session is missing in this browser tab. Reconnect with Google before sending funds.
          </p>
          <Link
            href="/circle-login?returnTo=/manage-wallet"
            className="mt-4 inline-flex items-center rounded-full border border-white/[0.12] bg-[#1a1b1f] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/[0.18] hover:bg-[#202127]"
          >
            Reconnect Circle Session
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white">Wallet Overview</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">Employee</p>
              <p className="mt-1 text-sm font-semibold text-white">{employee.name}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">Wallet Address</p>
              <a
                href={explorerAddressUrl(walletAddress)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-semibold text-[#fc72ff] hover:text-[#fc72ff]/80"
              >
                {walletAddress}
              </a>
            </div>
            <div className="rounded-xl bg-white/[0.04] px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">Available USDC</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{formatUsdc(balance)}</p>
            </div>
          </div>
          {balanceError && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {balanceError}
            </div>
          )}
        </Card>

        <Card className="p-6 sm:p-8">
          <h2 className="text-base font-semibold text-white">Send USDC</h2>
          <p className="mt-2 text-sm text-white/50">
            Send to another wallet on the same chain or bridge to another network.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">Destination Chain</span>
              <select
                value={destinationPreference}
                onChange={(event) => setDestinationPreference(event.target.value as (typeof destinationOptions)[number]["preference"])}
                disabled={isSubmitting || !circleAuth}
                className={inputStyles}
              >
                {destinationOptions.map((option) => (
                  <option key={option.preference} value={option.preference}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">Destination Wallet</span>
              <input
                type="text"
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
                placeholder="0x..."
                disabled={isSubmitting || !circleAuth}
                className={inputStyles}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">Amount (USDC)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="10.50"
                disabled={isSubmitting || !circleAuth}
                className={inputStyles}
              />
            </label>

            {destinationPreference !== "Arc" && (
              <div className="rounded-xl border border-[#fc72ff]/20 bg-[#fc72ff]/[0.06] px-4 py-3 text-sm text-[#fc72ff]/80">
                You're sending from Arc to {destinationLabel}. A small fee may apply for the bridge.
              </div>
            )}

            <Button
              block
              onClick={() => void handleTransfer()}
              disabled={isSubmitting || !circleAuth}
            >
              {isSubmitting ? "Sending…" : destinationPreference === "Arc" ? "Send USDC" : "Bridge with CCTP"}
            </Button>
          </div>

          {status && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              {status}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
