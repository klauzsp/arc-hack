"use client";

import { useState } from "react";
import { usePayroll } from "@/components/PayrollProvider";
import type { PayType, Recipient, TimeTrackingMode } from "@/lib/types";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

type RecipientFormState = Omit<Recipient, "id">;

const emptyRecipient: RecipientFormState = {
  walletAddress: "",
  name: "",
  payType: "yearly",
  rate: 90000,
  chainPreference: "Arc",
  timeTrackingMode: "schedule_based",
  scheduleId: "s-1",
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
  const { recipients, schedules, addRecipient, updateRecipient, deleteRecipient, getRecipientMetrics, loading, error } = usePayroll();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RecipientFormState>(emptyRecipient);
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setFormState(emptyRecipient);
    setEditingId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    setMessage(null);
    setDeleteError(null);
    setEditingId(null);
    setFormState(emptyRecipient);
    setShowForm(true);
  };

  const openEditForm = (recipient: Recipient) => {
    setMessage(null);
    setDeleteError(null);
    setEditingId(recipient.id);
    setFormState({
      walletAddress: recipient.walletAddress,
      name: recipient.name,
      payType: recipient.payType,
      rate: recipient.rate,
      chainPreference: recipient.chainPreference,
      timeTrackingMode: recipient.timeTrackingMode,
      scheduleId: recipient.scheduleId,
    });
    setShowForm(true);
  };

  const saveRecipient = async () => {
    if (!formState.name.trim() || !formState.walletAddress.trim()) return;
    setIsSaving(true);
    setDeleteError(null);
    try {
      if (editingId) {
        await updateRecipient(editingId, formState);
        setMessage("Recipient updated.");
      } else {
        await addRecipient(formState);
        setMessage("Recipient added.");
      }
      resetForm();
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

  if (loading && recipients.length === 0) {
    return <div className="text-sm text-slate-500">Loading recipients…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {recipients.length} active recipients across {new Set(recipients.map((recipient) => recipient.chainPreference).filter(Boolean)).size} chains
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Recipient
        </button>
      </div>

      {message && (
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm font-semibold text-emerald-800">{message}</p>
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
        <Card className="border-blue-200 bg-blue-50/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {editingId ? "Edit Recipient" : "Add New Recipient"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Capture payroll type, wallet, preferred chain, and tracking mode for the employee record.
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={formState.walletAddress}
              onChange={(event) => setFormState({ ...formState, walletAddress: event.target.value })}
              placeholder="Wallet address (0x...)"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={formState.payType}
              onChange={(event) => setFormState({ ...formState, payType: event.target.value as PayType })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={formState.chainPreference ?? "Arc"}
              onChange={(event) => setFormState({ ...formState, chainPreference: event.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="Arc">Arc</option>
              <option value="Ethereum">Ethereum</option>
              <option value="Base">Base</option>
              <option value="Arbitrum">Arbitrum</option>
            </select>
            <select
              value={formState.timeTrackingMode}
              onChange={(event) => setFormState({ ...formState, timeTrackingMode: event.target.value as TimeTrackingMode })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="schedule_based">Schedule-based</option>
              <option value="check_in_out">Check-in / Check-out</option>
            </select>
            <select
              value={formState.scheduleId ?? schedules[0]?.id}
              onChange={(event) => setFormState({ ...formState, scheduleId: event.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void saveRecipient()}
              disabled={isSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {isSaving ? "Saving…" : editingId ? "Save Changes" : "Save Recipient"}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Wallet</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Rate</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Available Now</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tracking</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recipients.map((recipient) => {
                const metrics = getRecipientMetrics(recipient.id);
                return (
                  <tr key={recipient.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {recipient.name.split(" ").map((part) => part[0]).join("")}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{recipient.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-400">
                      {recipient.walletAddress.slice(0, 6)}...{recipient.walletAddress.slice(-4)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <Badge variant={payTypeVariant(recipient.payType)}>{payTypeLabel(recipient.payType)}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-medium text-slate-900">
                      {formatRate(recipient.payType, recipient.rate)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-semibold text-emerald-700">
                      {metrics ? formatCurrency(metrics.availableToWithdraw) : "--"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-sm text-slate-600">{recipient.chainPreference ?? "--"}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-500">
                      {trackingLabel(recipient.timeTrackingMode)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openEditForm(recipient)}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === recipient.id}
                        onClick={() => {
                          void handleDeleteRecipient(recipient);
                        }}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
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
