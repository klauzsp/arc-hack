"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // --- Search ---
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // --- Inline edit ---
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<RecipientFormState>(emptyRecipient);
  const [inlineSaving, setInlineSaving] = useState(false);

  // --- Multi-select ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<{
    scheduleId: string | null;
    chainPreference: string | null;
    timeTrackingMode: TimeTrackingMode | null;
  }>({ scheduleId: null, chainPreference: null, timeTrackingMode: null });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.walletAddress && r.walletAddress.toLowerCase().includes(q)) ||
        (r.chainPreference && r.chainPreference.toLowerCase().includes(q)),
    );
  }, [recipients, search]);

  const startInlineEdit = useCallback(
    (recipient: Recipient) => {
      setInlineEditId(recipient.id);
      setInlineForm({
        walletAddress: recipient.walletAddress ?? "",
        name: recipient.name,
        payType: recipient.payType,
        rate: recipient.rate,
        chainPreference: recipient.chainPreference ?? null,
        timeTrackingMode: recipient.timeTrackingMode,
        scheduleId: recipient.scheduleId,
        employmentStartDate: recipient.employmentStartDate ?? "",
      });
    },
    [],
  );

  const cancelInlineEdit = useCallback(() => {
    setInlineEditId(null);
    setInlineForm(emptyRecipient);
  }, []);

  const saveInlineEdit = useCallback(async () => {
    if (!inlineEditId || !inlineForm.name.trim()) return;
    setInlineSaving(true);
    try {
      await updateRecipient(inlineEditId, {
        ...inlineForm,
        walletAddress: inlineForm.walletAddress.trim() || null,
        employmentStartDate: inlineForm.employmentStartDate || null,
      });
      setMessage("Recipient updated.");
      setInlineEditId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setInlineSaving(false);
    }
  }, [inlineEditId, inlineForm, updateRecipient]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    const allFilteredIds = new Set(filteredRecipients.map((r) => r.id));
    const allSelected = filteredRecipients.length > 0 && filteredRecipients.every((r) => selectedIds.has(r.id));
    setSelectedIds(allSelected ? new Set() : allFilteredIds);
  }, [filteredRecipients, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => selectedIds.has(r.id)),
    [recipients, selectedIds],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedRecipients.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedRecipients.length} recipient(s)? This keeps historical pay run records but removes them from future pay runs.`,
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    setDeleteError(null);
    setMessage(null);
    try {
      for (const r of selectedRecipients) {
        await deleteRecipient(r.id);
      }
      setMessage(`${selectedRecipients.length} recipient(s) deleted.`);
      setSelectedIds(new Set());
      if (editingId && selectedIds.has(editingId)) resetForm();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedRecipients, deleteRecipient, editingId, selectedIds]);

  const handleBulkEdit = useCallback(async () => {
    if (selectedRecipients.length === 0) return;
    const payload: Partial<RecipientFormState> = {};
    if (bulkEditForm.scheduleId != null && bulkEditForm.scheduleId !== "") payload.scheduleId = bulkEditForm.scheduleId;
    if (bulkEditForm.chainPreference != null && bulkEditForm.chainPreference !== "") payload.chainPreference = bulkEditForm.chainPreference;
    if (bulkEditForm.timeTrackingMode != null) payload.timeTrackingMode = bulkEditForm.timeTrackingMode;
    if (Object.keys(payload).length === 0) {
      setDeleteError("Select at least one field to update.");
      return;
    }
    setBulkSaving(true);
    setDeleteError(null);
    setMessage(null);
    try {
      for (const r of selectedRecipients) {
        await updateRecipient(r.id, payload);
      }
      setMessage(`${selectedRecipients.length} recipient(s) updated.`);
      setShowBulkEdit(false);
      setSelectedIds(new Set());
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Bulk update failed.");
    } finally {
      setBulkSaving(false);
    }
  }, [selectedRecipients, bulkEditForm, updateRecipient]);

  // Global "E" hotkey — only fires when no input/select/textarea is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLSelectElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const inlineInputStyles =
    "w-full rounded-lg border border-white/[0.08] bg-[#1a1b1f] px-2 py-1.5 text-xs text-white placeholder:text-white/28 focus:border-[#fc72ff]/45 focus:outline-none focus:ring-1 focus:ring-[#fc72ff]/18";

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
        <>
          {/* Search bar */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search recipients by name, wallet, or chain…  Press "/" to focus'
              className={`${inputStyles} pl-11 pr-10`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <Card className="flex flex-wrap items-center gap-4 border-[#fc72ff]/20 bg-[#fc72ff]/[0.06] p-4">
              <span className="text-sm font-medium text-white">
                {selectedIds.size} selected
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowBulkEdit(true)}
                  disabled={bulkDeleting}
                >
                  Edit selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "Deleting…" : "Delete selected"}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkDeleting}>
                  Clear selection
                </Button>
              </div>
            </Card>
          )}

          {/* Bulk edit form */}
          {showBulkEdit && selectedIds.size > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-white">Apply to {selectedIds.size} recipient(s)</h3>
              <p className="mt-1 text-xs text-white/50">Only fields you change will be updated. Leave as &ldquo;No change&rdquo; to skip.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-white/40">Schedule</span>
                  <select
                    value={bulkEditForm.scheduleId ?? ""}
                    onChange={(e) => setBulkEditForm((f) => ({ ...f, scheduleId: e.target.value || null }))}
                    className={inputStyles}
                  >
                    <option value="">No change</option>
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-white/40">Chain</span>
                  <select
                    value={bulkEditForm.chainPreference ?? ""}
                    onChange={(e) => setBulkEditForm((f) => ({ ...f, chainPreference: e.target.value || null }))}
                    className={inputStyles}
                  >
                    <option value="">No change</option>
                    <option value="Arc">Arc</option>
                    <option value="Ethereum">Ethereum</option>
                    <option value="Base">Base</option>
                    <option value="Arbitrum">Arbitrum</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-white/40">Tracking</span>
                  <select
                    value={bulkEditForm.timeTrackingMode ?? ""}
                    onChange={(e) => setBulkEditForm((f) => ({ ...f, timeTrackingMode: (e.target.value || null) as TimeTrackingMode | null }))}
                    className={inputStyles}
                  >
                    <option value="">No change</option>
                    <option value="schedule_based">Schedule-based</option>
                    <option value="check_in_out">Check-in/out</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => void handleBulkEdit()} disabled={bulkSaving}>
                  {bulkSaving ? "Applying…" : "Apply to selected"}
                </Button>
                <Button variant="outline" onClick={() => setShowBulkEdit(false)} disabled={bulkSaving}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {/* Recipients table */}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="w-10 px-3 py-3.5">
                    <input
                      type="checkbox"
                      checked={filteredRecipients.length > 0 && filteredRecipients.every((r) => selectedIds.has(r.id))}
                      onChange={selectAllFiltered}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#fc72ff] focus:ring-[#fc72ff]/40"
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Name</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Pay Type</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Rate</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Chain</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Tracking</th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Status</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Available</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredRecipients.map((recipient) => {
                  const metrics = getRecipientMetrics(recipient.id);
                  const isEditing = inlineEditId === recipient.id;

                  return (
                    <tr
                      key={recipient.id}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (
                          e.key === "e" &&
                          !isEditing &&
                          !(document.activeElement instanceof HTMLInputElement) &&
                          !(document.activeElement instanceof HTMLSelectElement)
                        ) {
                          e.preventDefault();
                          startInlineEdit(recipient);
                        }
                        if (e.key === "Escape" && isEditing) {
                          cancelInlineEdit();
                        }
                        if (e.key === "Enter" && isEditing) {
                          e.preventDefault();
                          void saveInlineEdit();
                        }
                      }}
                      className={`group transition-colors ${
                        isEditing
                          ? "bg-[#fc72ff]/[0.03]"
                          : "hover:bg-white/[0.02] focus:bg-white/[0.02]"
                      } ${selectedIds.has(recipient.id) ? "bg-[#fc72ff]/[0.06]" : ""}`}
                    >
                      {/* Select */}
                      <td className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(recipient.id)}
                          onChange={() => toggleSelect(recipient.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#fc72ff] focus:ring-[#fc72ff]/40"
                          aria-label={`Select ${recipient.name}`}
                        />
                      </td>
                      {/* Name */}
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={inlineForm.name}
                            onChange={(e) => setInlineForm({ ...inlineForm, name: e.target.value })}
                            className={inlineInputStyles}
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[11px] font-semibold text-white/72">
                              {initials(recipient.name)}
                            </div>
                            <span className="truncate font-medium text-white">{recipient.name}</span>
                          </div>
                        )}
                      </td>

                      {/* Pay Type */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={inlineForm.payType}
                            onChange={(e) => setInlineForm({ ...inlineForm, payType: e.target.value as PayType })}
                            className={inlineInputStyles}
                          >
                            <option value="yearly">Salary</option>
                            <option value="daily">Daily</option>
                            <option value="hourly">Hourly</option>
                          </select>
                        ) : (
                          <Badge variant={payTypeVariant(recipient.payType)}>
                            {payTypeLabel(recipient.payType)}
                          </Badge>
                        )}
                      </td>

                      {/* Rate */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={inlineForm.rate}
                            onChange={(e) => setInlineForm({ ...inlineForm, rate: Number(e.target.value) || 0 })}
                            className={`${inlineInputStyles} tabular-nums`}
                          />
                        ) : (
                          <span className="tabular-nums text-white/80">
                            {formatRate(recipient.payType, recipient.rate)}
                          </span>
                        )}
                      </td>

                      {/* Chain */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={inlineForm.chainPreference ?? "Arc"}
                            onChange={(e) => setInlineForm({ ...inlineForm, chainPreference: e.target.value })}
                            className={inlineInputStyles}
                          >
                            <option value="Arc">Arc</option>
                            <option value="Ethereum">Ethereum</option>
                            <option value="Base">Base</option>
                            <option value="Arbitrum">Arbitrum</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#fc72ff]" />
                            <span className="text-white/80">{recipient.chainPreference ?? "--"}</span>
                          </div>
                        )}
                      </td>

                      {/* Tracking */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={inlineForm.timeTrackingMode}
                            onChange={(e) => setInlineForm({ ...inlineForm, timeTrackingMode: e.target.value as TimeTrackingMode })}
                            className={inlineInputStyles}
                          >
                            <option value="schedule_based">Schedule</option>
                            <option value="check_in_out">Check-in/out</option>
                          </select>
                        ) : (
                          <span className="text-white/60">{trackingLabel(recipient.timeTrackingMode)}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge variant={recipient.onboardingStatus === "claimed" ? "success" : "warning"}>
                          {recipient.onboardingStatus === "claimed" ? "Claimed" : "Pending"}
                        </Badge>
                      </td>

                      {/* Available */}
                      <td className="px-4 py-3 text-right">
                        <span className="tabular-nums font-medium text-emerald-400">
                          {metrics ? formatCurrency(metrics.availableToWithdraw) : "--"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={inlineSaving}
                                onClick={() => { void saveInlineEdit(); }}
                                className={buttonStyles({ variant: "primary", size: "sm" })}
                              >
                                {inlineSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelInlineEdit}
                                className={buttonStyles({ variant: "outline", size: "sm" })}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startInlineEdit(recipient)}
                                title="Edit (E)"
                                className={buttonStyles({ variant: "ghost", size: "sm" })}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              {recipient.onboardingStatus !== "claimed" && (
                                <button
                                  type="button"
                                  disabled={issuingInviteId === recipient.id}
                                  onClick={() => { void handleIssueAccessCode(recipient); }}
                                  title="Issue access code"
                                  className={buttonStyles({ variant: "ghost", size: "sm", className: "text-emerald-400 hover:text-emerald-300" })}
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                  </svg>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={deletingId === recipient.id}
                                onClick={() => { void handleDeleteRecipient(recipient); }}
                                title="Delete"
                                className={buttonStyles({ variant: "danger", size: "sm" })}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRecipients.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-sm text-white/40">
                      No recipients match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="border-t border-white/[0.06] px-5 py-3">
              <p className="text-xs text-white/30">
                {filteredRecipients.length} of {recipients.length} recipients
                {search ? " (filtered)" : ""}
                <span className="ml-3 text-white/20">Press <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/40">E</kbd> on a focused row to edit inline &middot; <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/40">/</kbd> to search</span>
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
