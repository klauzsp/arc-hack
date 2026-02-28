"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Card } from "@/components/Card";
import { usePayroll } from "@/components/PayrollProvider";
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
  explorerAddressUrl,
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

function shortAddress(address: string | null | undefined) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
  const className =
    variant === "secondary"
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : variant === "ghost"
        ? "bg-slate-100 text-slate-400"
        : "bg-blue-600 text-white hover:bg-blue-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-inherit ${className}`}
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
    return <p className="text-sm text-blue-700">Waiting for on-chain confirmation…</p>;
  }

  if (isConfirmed) {
    return (
      <p className="text-sm text-emerald-700">
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
    return <p className="break-words text-sm text-red-700">{error.message}</p>;
  }

  return null;
}

export function CompanyCapitalBlock() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { treasury, refresh } = usePayroll();
  const [depositAmount, setDepositAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [returnAmount, setReturnAmount] = useState("");
  const [lastAction, setLastAction] = useState<Action>(null);

  const isArcChain = chainId === ARC_TESTNET_CHAIN_ID;
  const isCeo = !!address && address.toLowerCase() === CEO_ADDRESS.toLowerCase();
  const treasuryAddress = treasury?.treasuryAddress ?? CORE_ADDRESS;
  const custodyAddress = treasury?.usycCustodyAddress ?? CEO_ADDRESS;

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
        <h3 className="text-sm font-semibold text-slate-900">Treasury Controls</h3>
        <p className="mt-2 text-sm text-slate-500">Switch the connected wallet to Arc Testnet to manage the treasury.</p>
      </Card>
    );
  }

  if (!address) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Treasury Controls</h3>
        <p className="mt-2 text-sm text-slate-500">Connect the CEO wallet to fund the treasury and manage USYC conversions.</p>
      </Card>
    );
  }

  if (!isCeo) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900">Treasury Controls</h3>
        <p className="mt-2 text-sm text-slate-500">Only the CEO wallet can move funds between the treasury and the USYC Teller flow.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Live Treasury Control</h3>
            <p className="mt-1 text-xs text-slate-500">
              Deposits land in the Core treasury contract. Payroll executes from treasury. USYC conversions use the CEO
              wallet as the whitelisted Teller account, then funds are returned to treasury before payroll.
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {treasury?.source === "chain" ? "Chain-backed" : "API-backed"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Treasury Contract</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{shortAddress(treasuryAddress)}</p>
            <a className="mt-2 inline-block text-xs text-blue-700 underline" href={explorerAddressUrl(treasuryAddress)} target="_blank" rel="noreferrer">
              View Core contract
            </a>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">USYC Custody</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{shortAddress(custodyAddress)}</p>
            <a className="mt-2 inline-block text-xs text-blue-700 underline" href={explorerAddressUrl(custodyAddress)} target="_blank" rel="noreferrer">
              View CEO wallet
            </a>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Controller</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{shortAddress(treasury?.controllerAddress ?? CEO_ADDRESS)}</p>
            <p className="mt-2 text-xs text-slate-500">Connected wallet must match the configured CEO controller.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Treasury USDC</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{fmtAmount(treasuryUsdcBalance)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">CEO Wallet USDC</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{fmtAmount(walletUsdcBalance)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">CEO Wallet USYC</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{fmtAmount(walletUsycBalance)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Fund Treasury</h3>
            <p className="mt-1 text-xs text-slate-500">Deposit USDC from the connected CEO wallet into the Core treasury contract.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Wallet → Treasury</span>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Deposit Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
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
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">USDC</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <StepButton
            label={
              treasuryDepositBusy
                ? treasuryDepositReceipt.isLoading
                  ? "Confirming…"
                  : "Depositing…"
                : "Deposit to Treasury"
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
            success="Treasury deposit confirmed."
          />
        </div>
      </Card>

      <Card className="p-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Convert Treasury USDC to USYC</h3>
          <p className="mt-1 text-xs text-slate-500">
            Exact Teller flow: pull USDC from treasury to the CEO wallet, approve the Teller, then deposit into USYC.
          </p>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">USDC Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              type="number"
              min={0}
              step="any"
              value={convertAmount}
              onChange={(event) => resetConvertFlow(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">USDC</span>
          </div>
          {convertParsed > zero && (
            <p className="mt-1.5 text-xs text-slate-400">Teller USDC allowance: {fmtAmount(usdcAllowance)} USDC</p>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
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
            success="USDC pulled from the treasury into the CEO wallet."
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

      <Card className="p-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Redeem USYC Back to Treasury</h3>
          <p className="mt-1 text-xs text-slate-500">
            Exact Teller flow: approve USYC, redeem to the CEO wallet, then send the redeemed USDC back into Core so payroll can pay from treasury.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">USYC Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="number"
                min={0}
                step="any"
                value={redeemAmount}
                onChange={(event) => resetRedeemFlow(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">USYC</span>
            </div>
            {redeemParsed > zero && (
              <p className="mt-1.5 text-xs text-slate-400">Teller USYC allowance: {fmtAmount(usycAllowance)} USYC</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Return USDC Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="number"
                min={0}
                step="any"
                value={returnAmount}
                onChange={(event) => resetReturnFlow(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">USDC</span>
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
