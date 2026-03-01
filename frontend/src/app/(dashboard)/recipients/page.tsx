"use client";

import { useState } from "react";
import { usePayroll } from "@/components/PayrollProvider";
import type { PayType, Recipient, TimeTrackingMode } from "@/lib/types";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { publicConfig } from "@/lib/publicConfig";

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

export default function RecipientsPage() {
  const { recipients, schedules, addRecipient, updateRecipient, deleteRecipient, createRecipientAccessCode, getRecipientMetrics, loading, error } = usePayroll();
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
          throw new Error("Wallet address is required when the CEO creates the full recipient.");
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
      setDeleteError(saveError instanceof Error ? saveError.message : "Failed to save recipient.");
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
      setDeleteError(deleteActionError instanceof Error ? deleteActionError.message : "Failed to delete recipient.");
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
      setDeleteError(inviteError instanceof Error ? inviteError.message : "Failed to generate access code.");
    } finally {
      setIssuingInviteId(null);
    }
  };

  if (loading && recipients.length === 0) {
    return <div className="text-sm text-slate-500">Loading recipients…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Recipients</h2>
          <p className="mt-1 text-sm text-slate-500">
            {recipients.length} active recipients across {new Set(recipients.map((recipient) => recipient.chainPreference).filter(Boolean)).size} chains
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAddForm("full")}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Full Recipient
          </button>
          <button
            type="button"
            onClick={() => openAddForm("invite")}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100"
          >
            Generate Access Code
          </button>
        </div>
      </div>

      {message && (
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-emerald-800">{message}</p>
          {generatedInvite && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-emerald-700">
                {generatedInvite.name} can redeem this once until {new Date(generatedInvite.expiresAt).toLocaleString()}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                  {generatedInvite.code}
                </code>
                <code className="rounded-md bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                  {publicConfig.appUrl}/onboarding?code={generatedInvite.code}
                </code>
              </div>
            </div>
          )}
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </Card>
      )}

      {deleteError && (
        <Card className="border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-red-800">{deleteError}</p>
        </Card>
      )}

      {showForm && (
        <Card className="border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {editingId ? "Edit Recipient" : creationMode === "invite" ? "Generate Invite-Based Recipient" : "Add Full Recipient"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {editingId
                  ? "Update the live employee record."
                  : creationMode === "invite"
                    ? "The CEO presets name, pay, schedule, tracking mode, and start date. The employee only completes payout setup during onboarding."
                    : "Create the full employee record now. This path skips onboarding choices for the employee."}
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="text"
              value={formState.name}
              onChange={(event) => setFormState({ ...formState, name: event.target.value })}
              placeholder="Full name"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={formState.payType}
              onChange={(event) => setFormState({ ...formState, payType: event.target.value as PayType })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="yearly">Yearly salary</option>
              <option value="daily">Daily rate</option>
              <option value="hourly">Hourly rate</option>
            </select>
            <input
              type="number"
              min={0}
              value={formState.rate}
              onChange={(event) => setFormState({ ...formState, rate: Number(event.target.value) || 0 })}
              placeholder="Rate"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {(editingId || creationMode === "full") && (
              <input
                type="text"
                value={formState.walletAddress}
                onChange={(event) => setFormState({ ...formState, walletAddress: event.target.value })}
                placeholder="Wallet address"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
            {(editingId || creationMode === "full") && (
              <select
                value={formState.chainPreference ?? "Arc"}
                onChange={(event) => setFormState({ ...formState, chainPreference: event.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="Arc">Arc</option>
                <option value="Ethereum">Ethereum</option>
                <option value="Base">Base</option>
                <option value="Arbitrum">Arbitrum</option>
              </select>
            )}
            <select
              value={formState.timeTrackingMode}
              onChange={(event) => setFormState({ ...formState, timeTrackingMode: event.target.value as TimeTrackingMode })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="schedule_based">Schedule-based</option>
              <option value="check_in_out">Check-in / Check-out</option>
            </select>
            <select
              value={formState.scheduleId ?? schedules[0]?.id}
              onChange={(event) => setFormState({ ...formState, scheduleId: event.target.value })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              onChange={(event) => setFormState({ ...formState, employmentStartDate: event.target.value })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {(editingId || creationMode === "full") && (
            <p className="mt-3 text-xs text-slate-500">
              Worked since controls how far back the employee accrues earnings for testing and live withdrawals.
            </p>
          )}
          {!editingId && creationMode === "invite" && (
            <p className="mt-3 text-xs text-slate-500">
              The generated code will lock in the employee name, pay, schedule, tracking mode, and start date. During onboarding, the employee will only choose wallet/Circle and payout destination.
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void saveRecipient()}
              disabled={isSaving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {isSaving ? "Saving…" : editingId ? "Save Changes" : creationMode === "invite" ? "Create Code" : "Save Recipient"}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Wallet</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Onboarding</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Rate</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Available</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tracking</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recipients.map((recipient) => {
                const metrics = getRecipientMetrics(recipient.id);
                return (
                  <tr key={recipient.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {recipient.name.split(" ").map((part) => part[0]).join("")}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-slate-900">{recipient.name}</span>
                          <p className="text-xs text-slate-400">
                            Worked since {recipient.employmentStartDate ?? "not set"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-400">
                      {recipient.walletAddress
                        ? `${recipient.walletAddress.slice(0, 6)}...${recipient.walletAddress.slice(-4)}`
                        : "Pending claim"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="space-y-1">
                        <Badge variant={recipient.onboardingStatus === "claimed" ? "info" : "warning"}>
                          {recipient.onboardingStatus === "claimed" ? "Claimed" : "Awaiting claim"}
                        </Badge>
                        <p className="text-xs text-slate-400">
                          {recipient.onboardingStatus === "claimed"
                            ? recipient.onboardingMethod === "circle"
                              ? "Circle wallet"
                              : "Existing wallet"
                            : recipient.activeInvite
                              ? `Code live until ${new Date(recipient.activeInvite.expiresAt).toLocaleDateString()}`
                              : "No active code"}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge variant={payTypeVariant(recipient.payType)}>{payTypeLabel(recipient.payType)}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-slate-900">
                      {formatRate(recipient.payType, recipient.rate)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-emerald-700">
                      {metrics ? formatCurrency(metrics.availableToWithdraw) : "--"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-sm text-slate-600">{recipient.chainPreference ?? "--"}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                      {trackingLabel(recipient.timeTrackingMode)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditForm(recipient)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      {recipient.onboardingStatus !== "claimed" && (
                        <button
                          type="button"
                          disabled={issuingInviteId === recipient.id}
                          onClick={() => {
                            void handleIssueAccessCode(recipient);
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          {issuingInviteId === recipient.id ? "Generating…" : "Access Code"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={deletingId === recipient.id}
                        onClick={() => {
                          void handleDeleteRecipient(recipient);
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {deletingId === recipient.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
