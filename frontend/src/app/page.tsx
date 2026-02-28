"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useState, useEffect } from "react";
import { parseUnits, formatUnits } from "viem";
import {
  CEO_ADDRESS,
  USYC_TELLER_ADDRESS,
  USDC_ADDRESS,
  USYC_ADDRESS,
  USYC_TELLER_ABI,
  ERC20_ABI,
  SEPOLIA_CHAIN_ID,
} from "@/lib/contracts";

type Action = "approve" | "deposit" | null;

export default function Home() {
  const { isConnected, address } = useAccount();
  const [usdcAmount, setUsdcAmount] = useState("");
  const [lastAction, setLastAction] = useState<Action>(null);

  const isCeo =
    !!address && address.toLowerCase() === CEO_ADDRESS.toLowerCase();

  // Parse amount into USDC atomic units (6 decimals)
  let parsedAmount = 0n;
  try {
    parsedAmount = usdcAmount ? parseUnits(usdcAmount, 6) : 0n;
  } catch {
    parsedAmount = 0n;
  }

  // USDC balance of connected wallet
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  // USYC balance of connected wallet
  const { data: usycBalance, refetch: refetchUsycBalance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USYC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  // Current USDC allowance granted to the USYC Teller
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, USYC_TELLER_ADDRESS],
    query: { enabled: !!address },
  });

  const { writeContract, data: hash, isPending, error, reset } =
    useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed) {
      refetchUsdcBalance();
      refetchUsycBalance();
      refetchAllowance();
    }
  }, [isConfirmed, refetchUsdcBalance, refetchUsycBalance, refetchAllowance]);

  const isBusy = isPending || isConfirming;
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  const handleApprove = () => {
    setLastAction("approve");
    writeContract({
      chainId: SEPOLIA_CHAIN_ID,
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [USYC_TELLER_ADDRESS, parsedAmount],
    });
  };

  const handleDeposit = () => {
    setLastAction("deposit");
    writeContract({
      chainId: SEPOLIA_CHAIN_ID,
      address: USYC_TELLER_ADDRESS,
      abi: USYC_TELLER_ABI,
      functionName: "deposit",
      args: [parsedAmount, address as `0x${string}`],
    });
  };

  const handleAmountChange = (value: string) => {
    setUsdcAmount(value);
    reset();
    setLastAction(null);
  };

  return (
    <main style={{ padding: "2rem", maxWidth: "640px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ margin: 0 }}>ARC Hack</h1>
        <ConnectButton />
      </div>

      {isConnected ? (
        isCeo ? (
          <div
            style={{
              padding: "1.5rem",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
              Company Capital
            </h2>

            {/* Balance cards */}
            <div style={{ display: "flex", gap: "1rem" }}>
              <div
                style={{
                  flex: 1,
                  padding: "1rem",
                  background: "#f8fafc",
                  borderRadius: "6px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.25rem",
                    fontSize: "0.75rem",
                    color: "#64748b",
                  }}
                >
                  USDC Balance
                </p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.125rem" }}>
                  {usdcBalance !== undefined
                    ? Number(formatUnits(usdcBalance, 6)).toLocaleString(
                        "en-US",
                        { minimumFractionDigits: 2, maximumFractionDigits: 6 }
                      )
                    : "—"}
                </p>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: "1rem",
                  background: "#f8fafc",
                  borderRadius: "6px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.25rem",
                    fontSize: "0.75rem",
                    color: "#64748b",
                  }}
                >
                  USYC Balance
                </p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.125rem" }}>
                  {usycBalance !== undefined
                    ? Number(formatUnits(usycBalance, 6)).toLocaleString(
                        "en-US",
                        { minimumFractionDigits: 2, maximumFractionDigits: 6 }
                      )
                    : "—"}
                </p>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                USDC to Convert
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={usdcAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
              {allowance !== undefined && parsedAmount > 0n && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.75rem",
                    color: "#64748b",
                  }}
                >
                  Current allowance:{" "}
                  {Number(formatUnits(allowance, 6)).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{" "}
                  USDC
                </p>
              )}
            </div>

            {/* 2-step action buttons */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleApprove}
                disabled={isBusy || parsedAmount === 0n || !needsApproval}
                style={{
                  flex: 1,
                  padding: "0.65rem 1rem",
                  background:
                    needsApproval && parsedAmount > 0n ? "#2563eb" : "#e2e8f0",
                  color:
                    needsApproval && parsedAmount > 0n ? "#fff" : "#94a3b8",
                  border: "none",
                  borderRadius: "6px",
                  cursor:
                    isBusy || parsedAmount === 0n || !needsApproval
                      ? "not-allowed"
                      : "pointer",
                  opacity: isBusy && lastAction === "approve" ? 0.6 : 1,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                {isBusy && lastAction === "approve"
                  ? isConfirming
                    ? "Confirming…"
                    : "Approving…"
                  : "1. Approve USDC"}
              </button>

              <button
                onClick={handleDeposit}
                disabled={isBusy || parsedAmount === 0n || needsApproval}
                style={{
                  flex: 1,
                  padding: "0.65rem 1rem",
                  background:
                    !needsApproval && parsedAmount > 0n ? "#16a34a" : "#e2e8f0",
                  color:
                    !needsApproval && parsedAmount > 0n ? "#fff" : "#94a3b8",
                  border: "none",
                  borderRadius: "6px",
                  cursor:
                    isBusy || parsedAmount === 0n || needsApproval
                      ? "not-allowed"
                      : "pointer",
                  opacity: isBusy && lastAction === "deposit" ? 0.6 : 1,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                {isBusy && lastAction === "deposit"
                  ? isConfirming
                    ? "Confirming…"
                    : "Converting…"
                  : "2. Convert to USYC"}
              </button>
            </div>

            {/* Status messages */}
            {isConfirming && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "#64748b",
                }}
              >
                Waiting for confirmation…
              </p>
            )}
            {isConfirmed && (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#16a34a" }}>
                {lastAction === "approve"
                  ? "Approval confirmed. You can now convert to USYC."
                  : "Conversion confirmed. USYC received."}
              </p>
            )}
            {error && (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#dc2626" }}>
                {error.message}
              </p>
            )}
          </div>
        ) : (
          <p style={{ color: "#64748b" }}>
            This page is only accessible to the CEO wallet.
          </p>
        )
      ) : (
        <p style={{ color: "#64748b" }}>Connect your wallet to get started.</p>
      )}
    </main>
  );
}
