"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { usePayroll } from "@/components/PayrollProvider";
import { inputStyles, metricTileStyles } from "@/components/ui";
import {
  ARC_TESTNET_CHAIN_ID,
  CEO_ADDRESS,
  CORE_ABI,
  CORE_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
  USYC_ADDRESS,
  USYC_TELLER_ABI,
  USYC_TELLER_ADDRESS,
  explorerTxUrl,
} from "@/lib/contracts";

type Action =
  | "deposit_treasury"
  | "pull_treasury"
  | "approve_usdc"
  | "deposit_usyc"
  | "approve_usyc"
  | "redeem_usyc"
  | "return_treasury"
  | null;

function safeParse(value: string) {
  try {
    return value ? parseUnits(value, 6) : BigInt(0);
  } catch {
    return BigInt(0);
  }
}

function fmtAmount(value: bigint | undefined) {
  if (value === undefined) return "—";
  return Number(formatUnits(value, 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function StepButton({
  label,
  disabled,
  onClick,
  variant = "primary",
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const mappedVariant =
    variant === "secondary"
      ? "secondary"
      : variant === "ghost"
        ? "ghost"
        : "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={buttonStyles({
        variant: mappedVariant,
        size: "lg",
        block: true,
        className: variant === "ghost" ? "text-white/45 hover:text-white/60" : "",
      })}
    >
      {label}
    </button>
  );
}

function StatusRow({
  isConfirming,
  isConfirmed,
  error,
  hash,
  success,
}: {
  isConfirming: boolean;
  isConfirmed: boolean;
  error: Error | null;
  hash?: string;
  success: string;
}) {
  if (isConfirming) {
    return <p className="text-sm text-[#fc72ff]">Waiting for on-chain confirmation…</p>;
  }

  if (isConfirmed) {
    return (
      <p className="text-sm text-emerald-400">
        {success}
        {hash ? (
          <>
            {" "}
            <a className="underline" href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          </>
        ) : null}
      </p>
    );
  }

  if (error) {
    return <p className="break-words text-sm text-red-400">{error.message}</p>;
  }

  return null;
}
export function CompanyCapitalBlock() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { refresh } = usePayroll();
  const [depositAmount, setDepositAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [returnAmount, setReturnAmount] = useState("");
  const [lastAction, setLastAction] = useState<Action>(null);

  const isArcChain = chainId === ARC_TESTNET_CHAIN_ID;
  const isCeo = !!address && address.toLowerCase() === CEO_ADDRESS.toLowerCase();

  const depositParsed = safeParse(depositAmount);
  const convertParsed = safeParse(convertAmount);
  const redeemParsed = safeParse(redeemAmount);
  const returnParsed = safeParse(returnAmount);

  const { data: treasuryUsdcBalance, refetch: refetchTreasuryUsdcBalance } = useReadContract({
    chainId: ARC_TESTNET_CHAIN_ID,
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: "treasuryBalance",
    query: { enabled: isArcChain && isCeo },
  });

  const { data: walletUsdcBalance, refetch: refetchWalletUsdcBalance } = useReadContract({
    chainId: ARC_TESTNET_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: isArcChain && !!address && isCeo },
  });

  const { data: walletUsycBalance, refetch: refetchWalletUsycBalance } = useReadContract({
    chainId: ARC_TESTNET_CHAIN_ID,
    address: USYC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: isArcChain && !!address && isCeo },
  });

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    chainId: ARC_TESTNET_CHAIN_ID,
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, USYC_TELLER_ADDRESS],
    query: { enabled: isArcChain && !!address && isCeo },
  });

  const { data: usycAllowance, refetch: refetchUsycAllowance } = useReadContract({
    chainId: ARC_TESTNET_CHAIN_ID,
    address: USYC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, USYC_TELLER_ADDRESS],
    query: { enabled: isArcChain && !!address && isCeo },
  });

  const refetchAll = () => {
    void Promise.all([
      refetchTreasuryUsdcBalance(),
      refetchWalletUsdcBalance(),
      refetchWalletUsycBalance(),
      refetchUsdcAllowance(),
      refetchUsycAllowance(),
      refresh(),
    ]);
  };

  const treasuryDepositWrite = useWriteContract();
  const treasuryDepositReceipt = useWaitForTransactionReceipt({ hash: treasuryDepositWrite.data });
  const pullWrite = useWriteContract();
  const pullReceipt = useWaitForTransactionReceipt({ hash: pullWrite.data });
  const approveUsdcWrite = useWriteContract();
  const approveUsdcReceipt = useWaitForTransactionReceipt({ hash: approveUsdcWrite.data });
  const depositUsycWrite = useWriteContract();
  const depositUsycReceipt = useWaitForTransactionReceipt({ hash: depositUsycWrite.data });
  const approveUsycWrite = useWriteContract();
  const approveUsycReceipt = useWaitForTransactionReceipt({ hash: approveUsycWrite.data });
  const redeemUsycWrite = useWriteContract();
  const redeemUsycReceipt = useWaitForTransactionReceipt({ hash: redeemUsycWrite.data });
  const returnTreasuryWrite = useWriteContract();
  const returnTreasuryReceipt = useWaitForTransactionReceipt({ hash: returnTreasuryWrite.data });

  useEffect(() => {
    if (treasuryDepositReceipt.isSuccess) refetchAll();
  }, [treasuryDepositReceipt.isSuccess]);

  useEffect(() => {
    if (pullReceipt.isSuccess) refetchAll();
  }, [pullReceipt.isSuccess]);

  useEffect(() => {
    if (approveUsdcReceipt.isSuccess) refetchAll();
  }, [approveUsdcReceipt.isSuccess]);

  useEffect(() => {
    if (depositUsycReceipt.isSuccess) refetchAll();
  }, [depositUsycReceipt.isSuccess]);

  useEffect(() => {
    if (approveUsycReceipt.isSuccess) refetchAll();
  }, [approveUsycReceipt.isSuccess]);

  useEffect(() => {
    if (redeemUsycReceipt.isSuccess) {
      if (!returnAmount && redeemAmount) {
        setReturnAmount(redeemAmount);
      }
      refetchAll();
    }
  }, [redeemUsycReceipt.isSuccess, redeemAmount, returnAmount]);

  useEffect(() => {
    if (returnTreasuryReceipt.isSuccess) refetchAll();
  }, [returnTreasuryReceipt.isSuccess]);

  const resetConvertFlow = (value: string) => {
    setConvertAmount(value);
    setLastAction(null);
    pullWrite.reset();
    approveUsdcWrite.reset();
    depositUsycWrite.reset();
  };

  const resetRedeemFlow = (value: string) => {
    setRedeemAmount(value);
    setLastAction(null);
    approveUsycWrite.reset();
    redeemUsycWrite.reset();
  };

  const resetReturnFlow = (value: string) => {
    setReturnAmount(value);
    setLastAction(null);
    returnTreasuryWrite.reset();
  };

  const treasuryDepositBusy = treasuryDepositWrite.isPending || treasuryDepositReceipt.isLoading;
  const pullBusy = pullWrite.isPending || pullReceipt.isLoading;
  const approveUsdcBusy = approveUsdcWrite.isPending || approveUsdcReceipt.isLoading;
  const depositUsycBusy = depositUsycWrite.isPending || depositUsycReceipt.isLoading;
  const approveUsycBusy = approveUsycWrite.isPending || approveUsycReceipt.isLoading;
  const redeemUsycBusy = redeemUsycWrite.isPending || redeemUsycReceipt.isLoading;
  const returnTreasuryBusy = returnTreasuryWrite.isPending || returnTreasuryReceipt.isLoading;

  const zero = BigInt(0);
  const treasuryDepositReady = depositParsed > zero && (walletUsdcBalance ?? zero) >= depositParsed;
  const pullAvailable = convertParsed > zero && (treasuryUsdcBalance ?? zero) >= convertParsed;
  const approveUsdcNeeded = convertParsed > zero && (usdcAllowance ?? zero) < convertParsed;
  const convertReady = convertParsed > zero && !approveUsdcNeeded && (walletUsdcBalance ?? zero) >= convertParsed;
  const approveUsycNeeded = redeemParsed > zero && (usycAllowance ?? zero) < redeemParsed;
  const redeemReady = redeemParsed > zero && !approveUsycNeeded && (walletUsycBalance ?? zero) >= redeemParsed;
  const returnReady = returnParsed > zero && (walletUsdcBalance ?? zero) >= returnParsed;

  const handleTreasuryDeposit = () => {
    if (!address) return;
    setLastAction("deposit_treasury");
    treasuryDepositWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [CORE_ADDRESS, depositParsed],
    });
  };

  const handlePull = () => {
    if (!address) return;
    setLastAction("pull_treasury");
    pullWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "withdraw",
      args: [address as `0x${string}`, convertParsed],
    });
  };

  const handleApproveUsdc = () => {
    setLastAction("approve_usdc");
    approveUsdcWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [USYC_TELLER_ADDRESS, convertParsed],
    });
  };

  const handleDepositUsyc = () => {
    if (!address) return;
    setLastAction("deposit_usyc");
    depositUsycWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USYC_TELLER_ADDRESS,
      abi: USYC_TELLER_ABI,
      functionName: "deposit",
      args: [convertParsed, address as `0x${string}`],
    });
  };

  const handleApproveUsyc = () => {
    setLastAction("approve_usyc");
    approveUsycWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USYC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [USYC_TELLER_ADDRESS, redeemParsed],
    });
  };

  const handleRedeemUsyc = () => {
    if (!address) return;
    setLastAction("redeem_usyc");
    redeemUsycWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USYC_TELLER_ADDRESS,
      abi: USYC_TELLER_ABI,
      functionName: "redeem",
      args: [redeemParsed, address as `0x${string}`, address as `0x${string}`],
    });
  };

  const handleReturnToTreasury = () => {
    setLastAction("return_treasury");
    returnTreasuryWrite.writeContract({
      chainId: ARC_TESTNET_CHAIN_ID,
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [CORE_ADDRESS, returnParsed],
    });
  };

  if (!isArcChain) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Treasury Controls</h3>
        <p className="mt-2 text-sm text-white/50">Switch the connected wallet to Arc Testnet to manage the treasury.</p>
      </Card>
    );
  }

  if (!address) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Treasury Controls</h3>
        <p className="mt-2 text-sm text-white/50">Connect the CEO wallet to fund the treasury and manage USYC conversions.</p>
      </Card>
    );
  }

  if (!isCeo) {
    return (
      <Card className="p-6 sm:p-8">
        <h3 className="text-base font-semibold text-white">Company capital</h3>
        <p className="mt-2 text-sm text-white/50">Only the company's main wallet can add funds or move money between the treasury and yield.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">Balances</h3>
          <p className="mt-1 text-sm text-white/50">
            Add USDC to the treasury, move idle cash into yield (USYC), or redeem back when you need it for payroll.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className={metricTileStyles}>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Treasury USDC</p>
            <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-white" title={fmtAmount(treasuryUsdcBalance)}>{fmtAmount(treasuryUsdcBalance)}</p>
          </div>
          <div className={metricTileStyles}>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Your wallet USDC</p>
            <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-white" title={fmtAmount(walletUsdcBalance)}>{fmtAmount(walletUsdcBalance)}</p>
          </div>
          <div className={metricTileStyles}>
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">Your wallet USYC</p>
            <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-white" title={fmtAmount(walletUsycBalance)}>{fmtAmount(walletUsycBalance)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div>
          <h3 className="text-base font-semibold text-white">Add money to treasury</h3>
          <p className="mt-1 text-sm text-white/50">Move USDC from your connected wallet into the treasury so pay runs can use it.</p>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-white/60">Deposit Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
            <input
              type="number"
              min={0}
              step="any"
              value={depositAmount}
              onChange={(event) => {
                setDepositAmount(event.target.value);
                setLastAction(null);
                treasuryDepositWrite.reset();
              }}
              placeholder="0.00"
              className={`${inputStyles} pl-7 pr-16`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">USDC</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <StepButton
            label={
              treasuryDepositBusy
                ? treasuryDepositReceipt.isLoading
                  ? "Confirming…"
                  : "Adding…"
                : "Add to treasury"
            }
            onClick={handleTreasuryDeposit}
            disabled={treasuryDepositBusy || !treasuryDepositReady}
          />
        </div>

        <div className="mt-3">
          <StatusRow
            isConfirming={treasuryDepositReceipt.isLoading}
            isConfirmed={treasuryDepositReceipt.isSuccess && lastAction === "deposit_treasury"}
            error={treasuryDepositWrite.error}
            hash={treasuryDepositWrite.data}
            success="Added to treasury."
          />
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div>
          <h3 className="text-base font-semibold text-white">Move idle cash into yield (USYC)</h3>
          <p className="mt-1 text-sm text-white/50">
            Move USDC from the treasury into your wallet, then deposit it into USYC to earn yield.
          </p>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-white/60">Amount (USDC)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
            <input
              type="number"
              min={0}
              step="any"
              value={convertAmount}
              onChange={(event) => resetConvertFlow(event.target.value)}
              placeholder="0.00"
              className={`${inputStyles} pl-7 pr-16`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">USDC</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <StepButton
            label={pullBusy ? (pullReceipt.isLoading ? "Confirming…" : "Pulling…") : "1. Pull from Treasury"}
            onClick={handlePull}
            disabled={pullBusy || !pullAvailable}
            variant={pullAvailable ? "primary" : "ghost"}
          />
          <StepButton
            label={approveUsdcBusy ? (approveUsdcReceipt.isLoading ? "Confirming…" : "Approving…") : "2. Approve USDC"}
            onClick={handleApproveUsdc}
            disabled={approveUsdcBusy || convertParsed === zero || !approveUsdcNeeded}
            variant={approveUsdcNeeded ? "secondary" : "ghost"}
          />
          <StepButton
            label={depositUsycBusy ? (depositUsycReceipt.isLoading ? "Confirming…" : "Depositing…") : "3. Deposit to USYC"}
            onClick={handleDepositUsyc}
            disabled={depositUsycBusy || !convertReady}
            variant={convertReady ? "primary" : "ghost"}
          />
        </div>

        <div className="mt-3 space-y-2">
          <StatusRow
            isConfirming={pullReceipt.isLoading}
            isConfirmed={pullReceipt.isSuccess && lastAction === "pull_treasury"}
            error={pullWrite.error}
            hash={pullWrite.data}
            success="USDC moved to your wallet."
          />
          <StatusRow
            isConfirming={approveUsdcReceipt.isLoading}
            isConfirmed={approveUsdcReceipt.isSuccess && lastAction === "approve_usdc"}
            error={approveUsdcWrite.error}
            hash={approveUsdcWrite.data}
            success="USDC approval confirmed."
          />
          <StatusRow
            isConfirming={depositUsycReceipt.isLoading}
            isConfirmed={depositUsycReceipt.isSuccess && lastAction === "deposit_usyc"}
            error={depositUsycWrite.error}
            hash={depositUsycWrite.data}
            success="USYC deposit confirmed."
          />
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div>
          <h3 className="text-base font-semibold text-white">Redeem USYC back for payroll</h3>
          <p className="mt-1 text-sm text-white/50">
            Redeem USYC to USDC in your wallet, then send that USDC back to the treasury so pay runs can use it.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/60">USYC Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
              <input
                type="number"
                min={0}
                step="any"
                value={redeemAmount}
                onChange={(event) => resetRedeemFlow(event.target.value)}
                placeholder="0.00"
                className={`${inputStyles} pl-7 pr-16`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">USYC</span>
            </div>
            {redeemParsed > zero && (
              <p className="mt-1.5 text-xs text-white/40">Teller USYC allowance: {fmtAmount(usycAllowance)} USYC</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/60">Return USDC Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
              <input
                type="number"
                min={0}
                step="any"
                value={returnAmount}
                onChange={(event) => resetReturnFlow(event.target.value)}
                placeholder="0.00"
                className={`${inputStyles} pl-7 pr-16`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white/40">USDC</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <StepButton
            label={approveUsycBusy ? (approveUsycReceipt.isLoading ? "Confirming…" : "Approving…") : "1. Approve USYC"}
            onClick={handleApproveUsyc}
            disabled={approveUsycBusy || redeemParsed === zero || !approveUsycNeeded}
            variant={approveUsycNeeded ? "secondary" : "ghost"}
          />
          <StepButton
            label={redeemUsycBusy ? (redeemUsycReceipt.isLoading ? "Confirming…" : "Redeeming…") : "2. Redeem to Wallet"}
            onClick={handleRedeemUsyc}
            disabled={redeemUsycBusy || !redeemReady}
            variant={redeemReady ? "primary" : "ghost"}
          />
          <StepButton
            label={returnTreasuryBusy ? (returnTreasuryReceipt.isLoading ? "Confirming…" : "Returning…") : "3. Return to Treasury"}
            onClick={handleReturnToTreasury}
            disabled={returnTreasuryBusy || !returnReady}
            variant={returnReady ? "primary" : "ghost"}
          />
        </div>

        <div className="mt-3 space-y-2">
          <StatusRow
            isConfirming={approveUsycReceipt.isLoading}
            isConfirmed={approveUsycReceipt.isSuccess && lastAction === "approve_usyc"}
            error={approveUsycWrite.error}
            hash={approveUsycWrite.data}
            success="USYC approval confirmed."
          />
          <StatusRow
            isConfirming={redeemUsycReceipt.isLoading}
            isConfirmed={redeemUsycReceipt.isSuccess && lastAction === "redeem_usyc"}
            error={redeemUsycWrite.error}
            hash={redeemUsycWrite.data}
            success="USYC redeemed to the CEO wallet."
          />
          <StatusRow
            isConfirming={returnTreasuryReceipt.isLoading}
            isConfirmed={returnTreasuryReceipt.isSuccess && lastAction === "return_treasury"}
            error={returnTreasuryWrite.error}
            hash={returnTreasuryWrite.data}
            success="Redeemed USDC returned to the treasury."
          />
        </div>
      </Card>
    </div>
  );
}
