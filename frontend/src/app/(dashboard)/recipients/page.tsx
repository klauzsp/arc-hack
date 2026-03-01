"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button, buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { usePayroll } from "@/components/PayrollProvider";
import { StatCard } from "@/components/StatCard";
import { inputStyles, metricTileStyles, subtlePanelStyles } from "@/components/ui";
import { publicConfig } from "@/lib/publicConfig";
import type { PayType, Recipient, TimeTrackingMode } from "@/lib/types";

type CreationMode = "full" | "invite";

type RecipientFormState = {
  walletAddress: string;
  name: string;
  payType: PayType;
  rate: number;
  chainPreference: string | null;
  destinationChainId?: number | null;
  destinationWalletAddress?: string | null;
  timeTrackingMode: TimeTrackingMode;
  scheduleId?: string | null;
  employmentStartDate: string;
};

const emptyRecipient: RecipientFormState = {
  walletAddress: "",
  name: "",
  payType: "yearly",
  rate: 90000,
  chainPreference: "Arc",
  timeTrackingMode: "schedule_based",
  scheduleId: "s-1",
  employmentStartDate: "",
};

function payTypeVariant(payType: PayType): "info" | "default" | "warning" {
  if (payType === "yearly") return "info";
  if (payType === "daily") return "warning";
  return "default";
}

function payTypeLabel(payType: PayType) {
  return payType === "yearly" ? "Salary" : payType === "daily" ? "Daily" : "Hourly";
}

function trackingLabel(trackingMode: TimeTrackingMode) {
  return trackingMode === "check_in_out" ? "Check-in/out" : "Schedule";
}

function formatRate(payType: PayType, rate: number) {
  if (payType === "yearly") return `$${rate.toLocaleString()}/yr`;
  if (payType === "daily") return `$${rate}/day`;
  return `$${rate}/hr`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function inviteStatusCopy(recipient: Recipient) {
  if (recipient.onboardingStatus === "claimed") {
    return recipient.onboardingMethod === "circle" ? "Circle wallet active" : "External wallet active";
  }
  if (recipient.activeInvite) {
    return `Code live until ${new Date(recipient.activeInvite.expiresAt).toLocaleDateString()}`;
  }
  return "No active code";
}

export default function RecipientsPage() {
  const {
    recipients,
    schedules,
    addRecipient,
    updateRecipient,
    deleteRecipient,
    createRecipientAccessCode,
    getRecipientMetrics,
    loading,
    error,
  } = usePayroll();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>("full");
  const [message, setMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [issuingInviteId, setIssuingInviteId] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<{
    code: string;
    name: string;
    expiresAt: string;
  } | null>(null);
  const [formState, setFormState] = useState<RecipientFormState>(emptyRecipient);
  const [isSaving, setIsSaving] = useState(false);

  const activeChains = new Set(
    recipients.map((recipient) => recipient.chainPreference).filter(Boolean),
  ).size;
  const pendingClaims = recipients.filter(
    (recipient) => recipient.onboardingStatus !== "claimed",
  ).length;
  const totalAvailable = recipients.reduce((sum, recipient) => {
    return sum + (getRecipientMetrics(recipient.id)?.availableToWithdraw ?? 0);
  }, 0);

  const resetForm = () => {
    setFormState(emptyRecipient);
    setEditingId(null);
    setCreationMode("full");
    setShowForm(false);
  };

  const openAddForm = (mode: CreationMode) => {
    setMessage(null);
    setDeleteError(null);
    setGeneratedInvite(null);
    setEditingId(null);
    setCreationMode(mode);
    setFormState(emptyRecipient);
    setShowForm(true);
  };

  const openEditForm = (recipient: Recipient) => {
    setMessage(null);
    setDeleteError(null);
    setGeneratedInvite(null);
    setEditingId(recipient.id);
    setCreationMode("full");
    setFormState({
      walletAddress: recipient.walletAddress ?? "",
      name: recipient.name,
      payType: recipient.payType,
      rate: recipient.rate,
      chainPreference: recipient.chainPreference ?? null,
      timeTrackingMode: recipient.timeTrackingMode,
      scheduleId: recipient.scheduleId,
      employmentStartDate: recipient.employmentStartDate ?? "",
    });
    setShowForm(true);
  };

  const saveRecipient = async () => {
    if (!formState.name.trim()) return;
    setIsSaving(true);
    setDeleteError(null);
    try {
      if (editingId) {
        const payload = {
          ...formState,
          walletAddress: formState.walletAddress.trim() || null,
          employmentStartDate: formState.employmentStartDate || null,
        };
        await updateRecipient(editingId, payload);
        setMessage("Recipient updated.");
      } else if (creationMode === "invite") {
        const created = await addRecipient({
          name: formState.name.trim(),
          payType: formState.payType,
          rate: formState.rate,
          scheduleId: formState.scheduleId ?? null,
          timeTrackingMode: formState.timeTrackingMode,
          employmentStartDate: formState.employmentStartDate || null,
        });
        const invite = await createRecipientAccessCode(created.id);
        setGeneratedInvite({
          code: invite.code,
          name: created.name,
          expiresAt: invite.invite.expiresAt,
        });
        setMessage("Access code generated.");
      } else {
        if (!formState.walletAddress.trim()) {
          throw new Error(
            "Wallet address is required when the CEO creates the full recipient.",
          );
        }
        const payload = {
          ...formState,
          walletAddress: formState.walletAddress.trim(),
          employmentStartDate: formState.employmentStartDate || null,
        };
        await addRecipient(payload);
        setMessage("Recipient added.");
      }
      resetForm();
    } catch (saveError) {
      setDeleteError(
        saveError instanceof Error ? saveError.message : "Failed to save recipient.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipient = async (recipient: Recipient) => {
    const confirmed = window.confirm(
      `Delete ${recipient.name} from active recipients?\n\nThis keeps historical pay run records intact but removes the recipient from future treasury pay runs.`,
    );
    if (!confirmed) return;

    setDeletingId(recipient.id);
    setDeleteError(null);
    setMessage(null);
    try {
      await deleteRecipient(recipient.id);
      if (editingId === recipient.id) resetForm();
      setMessage("Recipient deleted.");
    } catch (deleteActionError) {
      setDeleteError(
        deleteActionError instanceof Error
          ? deleteActionError.message
          : "Failed to delete recipient.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleIssueAccessCode = async (recipient: Recipient) => {
    setIssuingInviteId(recipient.id);
    setDeleteError(null);
    setMessage(null);
    try {
      const invite = await createRecipientAccessCode(recipient.id);
      setGeneratedInvite({
        code: invite.code,
        name: recipient.name,
        expiresAt: invite.invite.expiresAt,
      });
      setMessage("One-time onboarding code generated.");
    } catch (inviteError) {
      setDeleteError(
        inviteError instanceof Error
          ? inviteError.message
          : "Failed to generate access code.",
      );
    } finally {
      setIssuingInviteId(null);
    }
  };

  if (loading && recipients.length === 0) {
    return <div className="text-sm text-white/50">Loading recipients…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team Payroll"
        title="Recipients"
        description="Manage live employees, invite-only onboarding codes, and payout destinations from one roster."
        meta={
          <>
            <Badge variant="info">{recipients.length} recipients</Badge>
            <Badge variant="default">{activeChains} active chains</Badge>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => openAddForm("invite")}>
              Generate Access Code
            </Button>
            <Button variant="primary" onClick={() => openAddForm("full")}>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              Add Full Recipient
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Available To Withdraw"
          value={formatCurrency(totalAvailable)}
          subtitle="Across the active roster"
          icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
          valueClassName="text-emerald-400"
        />
        <StatCard
          label="Pending Onboarding"
          value={String(pendingClaims)}
          subtitle="Recipients awaiting claim or access code redemption"
          icon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Payout Rail Mix"
          value={String(activeChains)}
          subtitle="Networks currently assigned across recipients"
          icon="M3.75 3v11.25m0 0a2.25 2.25 0 002.25 2.25h11.25m-13.5-2.25l5.233-5.233a1.125 1.125 0 011.591 0l2.258 2.258a1.125 1.125 0 001.591 0l4.858-4.858"
        />
      </div>

      {message && (
        <Card className="border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-300">{message}</p>
          {generatedInvite ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr]">
              <div className={`${subtlePanelStyles} px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  One-time code
                </p>
                <code className="mt-2 block text-sm font-semibold text-white">
                  {generatedInvite.code}
                </code>
              </div>
              <div className={`${subtlePanelStyles} min-w-0 px-4 py-3`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Redemption link
                </p>
                <p className="mt-2 truncate text-xs text-white/58">
                  {publicConfig.appUrl}/onboarding?code={generatedInvite.code}
                </p>
                <p className="mt-2 text-xs text-emerald-400/80">
                  {generatedInvite.name} can redeem this once until{" "}
                  {new Date(generatedInvite.expiresAt).toLocaleString()}.
                </p>
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {error ? (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{error}</p>
        </Card>
      ) : null}

      {deleteError ? (
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{deleteError}</p>
        </Card>
      ) : null}

      {showForm ? (
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#fc72ff]">
                {editingId
                  ? "Edit recipient"
                  : creationMode === "invite"
                    ? "Invite workflow"
                    : "Full recipient"}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white">
                {editingId
                  ? "Update recipient details"
                  : creationMode === "invite"
                    ? "Create an invite-based recipient"
                    : "Create a live employee record"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/52">
                {editingId
                  ? "Adjust payout routing, pay type, schedule, and start date for an existing employee."
                  : creationMode === "invite"
                    ? "The CEO locks in pay, schedule, tracking mode, and start date. The employee only completes payout setup during onboarding."
                    : "This path skips onboarding choice and creates the employee as a fully assigned live recipient right now."}
              </p>
            </div>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input
              type="text"
              value={formState.name}
              onChange={(event) =>
                setFormState({ ...formState, name: event.target.value })
              }
              placeholder="Full name"
              className={inputStyles}
            />
            <select
              value={formState.payType}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  payType: event.target.value as PayType,
                })
              }
              className={inputStyles}
            >
              <option value="yearly">Yearly salary</option>
              <option value="daily">Daily rate</option>
              <option value="hourly">Hourly rate</option>
            </select>
            <input
              type="number"
              min={0}
              value={formState.rate}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  rate: Number(event.target.value) || 0,
                })
              }
              placeholder="Rate"
              className={inputStyles}
            />
            {(editingId || creationMode === "full") && (
              <input
                type="text"
                value={formState.walletAddress}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    walletAddress: event.target.value,
                  })
                }
                placeholder="Wallet address"
                className={`${inputStyles} font-mono`}
              />
            )}
            {(editingId || creationMode === "full") && (
              <select
                value={formState.chainPreference ?? "Arc"}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    chainPreference: event.target.value,
                  })
                }
                className={inputStyles}
              >
                <option value="Arc">Arc</option>
                <option value="Ethereum">Ethereum</option>
                <option value="Base">Base</option>
                <option value="Arbitrum">Arbitrum</option>
              </select>
            )}
            <select
              value={formState.timeTrackingMode}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  timeTrackingMode: event.target.value as TimeTrackingMode,
                })
              }
              className={inputStyles}
            >
              <option value="schedule_based">Schedule-based</option>
              <option value="check_in_out">Check-in / Check-out</option>
            </select>
            <select
              value={formState.scheduleId ?? schedules[0]?.id}
              onChange={(event) =>
                setFormState({ ...formState, scheduleId: event.target.value })
              }
              className={inputStyles}
            >
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={formState.employmentStartDate}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  employmentStartDate: event.target.value,
                })
              }
              className={inputStyles}
            />
          </div>

          <div className="mt-4 text-xs text-white/42">
            {editingId || creationMode === "full"
              ? "Worked since controls how far back the employee accrues earnings for testing and live withdrawals."
              : "The generated code locks in the employee name, pay, schedule, tracking mode, and start date. During onboarding, the employee only chooses wallet and payout destination."}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                void saveRecipient();
              }}
              disabled={isSaving}
            >
              {isSaving
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : creationMode === "invite"
                    ? "Create Code"
                    : "Save Recipient"}
            </Button>
          </div>
        </Card>
      ) : null}

      {recipients.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-base font-semibold text-white">No recipients yet</p>
          <p className="mt-2 text-sm text-white/52">
            Add a full recipient or issue a one-time access code to start onboarding employees.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => openAddForm("invite")}>
              Generate Access Code
            </Button>
            <Button variant="primary" onClick={() => openAddForm("full")}>
              Add Full Recipient
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {recipients.map((recipient) => {
            const metrics = getRecipientMetrics(recipient.id);

            return (
              <Card key={recipient.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 xl:max-w-[320px]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-sm font-semibold text-white/72">
                        {initials(recipient.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-white">
                            {recipient.name}
                          </h3>
                          <Badge variant={payTypeVariant(recipient.payType)}>
                            {payTypeLabel(recipient.payType)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-white/46">
                          Worked since {recipient.employmentStartDate ?? "not set"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className={`${subtlePanelStyles} px-4 py-3`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          Wallet
                        </p>
                        <p className="mt-2 break-all font-mono text-xs text-white/68">
                          {recipient.walletAddress ?? "Pending claim"}
                        </p>
                      </div>

                      <div className={`${subtlePanelStyles} px-4 py-3`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              recipient.onboardingStatus === "claimed"
                                ? "info"
                                : "warning"
                            }
                          >
                            {recipient.onboardingStatus === "claimed"
                              ? "Claimed"
                              : "Awaiting claim"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-white/52">
                          {inviteStatusCopy(recipient)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={metricTileStyles}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Rate
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {formatRate(recipient.payType, recipient.rate)}
                      </p>
                    </div>
                    <div className={metricTileStyles}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Available
                      </p>
                      <p className="mt-2 text-base font-semibold text-emerald-400">
                        {metrics
                          ? formatCurrency(metrics.availableToWithdraw)
                          : "--"}
                      </p>
                    </div>
                    <div className={metricTileStyles}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Chain
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#fc72ff]" />
                        <span className="text-base font-semibold text-white">
                          {recipient.chainPreference ?? "--"}
                        </span>
                      </div>
                    </div>
                    <div className={metricTileStyles}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        Tracking
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {trackingLabel(recipient.timeTrackingMode)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:max-w-[240px] xl:justify-end">
                    <button
                      type="button"
                      onClick={() => openEditForm(recipient)}
                      className={buttonStyles({ variant: "secondary", size: "sm" })}
                    >
                      Edit
                    </button>
                    {recipient.onboardingStatus !== "claimed" ? (
                      <button
                        type="button"
                        disabled={issuingInviteId === recipient.id}
                        onClick={() => {
                          void handleIssueAccessCode(recipient);
                        }}
                        className={buttonStyles({ variant: "ghost", size: "sm", className: "border-emerald-500/18 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/16" })}
                      >
                        {issuingInviteId === recipient.id
                          ? "Generating…"
                          : "Access Code"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={deletingId === recipient.id}
                      onClick={() => {
                        void handleDeleteRecipient(recipient);
                      }}
                      className={buttonStyles({ variant: "danger", size: "sm" })}
                    >
                      {deletingId === recipient.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
