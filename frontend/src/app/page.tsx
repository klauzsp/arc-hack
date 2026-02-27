"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useEffect } from "react";
import { counterAddress, counterAbi } from "@/lib/contracts";

export default function Home() {
  const { isConnected } = useAccount();

  const {
    data: count,
    refetch,
  } = useReadContract({
    address: counterAddress,
    abi: counterAbi,
    functionName: "count",
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed) refetch();
  }, [isConfirmed, refetch]);

  const isBusy = isPending || isConfirming;

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
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              padding: "1.5rem",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
            }}
          >
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.875rem", color: "#64748b" }}>
              Current Count
            </p>
            <p style={{ margin: 0, fontSize: "2.5rem", fontWeight: 700 }}>
              {count?.toString() ?? "—"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() =>
                writeContract({ address: counterAddress, abi: counterAbi, functionName: "increment" })
              }
              disabled={isBusy}
              style={{
                padding: "0.6rem 1.25rem",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              {isBusy ? "Pending…" : "Increment"}
            </button>

            <button
              onClick={() =>
                writeContract({ address: counterAddress, abi: counterAbi, functionName: "reset" })
              }
              disabled={isBusy}
              style={{
                padding: "0.6rem 1.25rem",
                background: "transparent",
                color: "#64748b",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              Reset
            </button>
          </div>

          {isConfirming && (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
              Waiting for confirmation…
            </p>
          )}
          {isConfirmed && (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#16a34a" }}>
              Transaction confirmed.
            </p>
          )}
          {error && (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#dc2626" }}>
              {error.message}
            </p>
          )}
        </div>
      ) : (
        <p style={{ color: "#64748b" }}>Connect your wallet to get started.</p>
      )}
    </main>
  );
}
