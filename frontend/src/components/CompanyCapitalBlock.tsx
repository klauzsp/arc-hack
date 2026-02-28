"use client";

import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useState, useEffect } from "react";
import { parseUnits, formatUnits } from "viem";
import {
  USYC_TELLER_ADDRESS,
  USDC_ADDRESS,
  USYC_ADDRESS,
  USYC_TELLER_ABI,
  ERC20_ABI,
  SEPOLIA_CHAIN_ID,
} from "@/lib/contracts";
import { useAccount } from "wagmi";
import { Card } from "@/components/Card";

type Action = "approve" | "deposit" | null;

export function CompanyCapitalBlock() {
  const { address } = useAccount();
  const [usdcAmount, setUsdcAmount] = useState("");
  const [lastAction, setLastAction] = useState<Action>(null);

  let parsedAmount = BigInt(0);
  try {
    parsedAmount = usdcAmount ? parseUnits(usdcAmount, 6) : BigInt(0);
  } catch {
    parsedAmount = BigInt(0);
  }

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  const { data: usycBalance, refetch: refetchUsycBalance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USYC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: SEPOLIA_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, USYC_TELLER_ADDRESS],
    query: { enabled: !!address },
  });

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
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
  const needsApproval = parsedAmount > BigInt(0) && (allowance ?? BigInt(0)) < parsedAmount;

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

  const fmtBalance = (val: bigint | undefined) =>
    val !== undefined
      ? Number(formatUnits(val, 6)).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        })
      : "—";

  return (
    <Card className="p-6">
      <h3 className="text-sm font-semibold text-slate-900">USDC / USYC Conversion</h3>
      <p className="mt-1 text-xs text-slate-500">Convert idle USDC to yield-bearing USYC via the Teller contract.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <span className="text-sm font-bold text-blue-600">$</span>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">USDC Balance</p>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{fmtBalance(usdcBalance)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-sm font-bold text-emerald-600">Y</span>
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">USYC Balance</p>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{fmtBalance(usycBalance)}</p>
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Amount to convert
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
          <input
            type="number"
            min={0}
            step="any"
            value={usdcAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">USDC</span>
        </div>
        {allowance !== undefined && parsedAmount > BigInt(0) && (
          <p className="mt-1.5 text-xs text-slate-400">
            Current allowance: {fmtBalance(allowance)} USDC
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isBusy || parsedAmount === BigInt(0) || !needsApproval}
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isBusy && lastAction === "approve" ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isConfirming ? "Confirming…" : "Approving…"}
            </>
          ) : (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">1</span>
              Approve USDC
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleDeposit}
          disabled={isBusy || parsedAmount === BigInt(0) || needsApproval}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isBusy && lastAction === "deposit" ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isConfirming ? "Confirming…" : "Converting…"}
            </>
          ) : (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">2</span>
              Convert to USYC
            </>
          )}
        </button>
      </div>

      {isConfirming && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Waiting for on-chain confirmation…
        </div>
      )}
      {isConfirmed && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {lastAction === "approve"
            ? "Approval confirmed. You can now convert to USYC."
            : "Conversion confirmed. USYC received."}
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error.message}
        </div>
      )}
    </Card>
  );
}
