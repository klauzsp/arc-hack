"use client";

import { useMemo, useState } from "react";
import { useAuthSession } from "@/components/AuthProvider";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { usePayroll } from "@/components/PayrollProvider";
import type { HolidayRecord } from "@/lib/types";

type HolidayForm = {
  date: string;
  name: string;
};

const emptyHoliday: HolidayForm = {
  date: "",
  name: "",
};

function statusVariant(status: string): "warning" | "success" | "default" {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  return "default";
}

const inputCls = "rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#fc72ff]/50 focus:outline-none focus:ring-1 focus:ring-[#fc72ff]/20";

export default function HolidaysPage() {
  const { role } = useAuthSession();
  const {
    holidayRecords,
    adminTimeOffRequests,
    timeOffPolicy,
    createHoliday,
    updateHoliday,
    reviewTimeOffRequest,
    loading,
    error,
  } = usePayroll();
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [holidayForm, setHolidayForm] = useState<HolidayForm>(emptyHoliday);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pendingRequests = useMemo(
    () => adminTimeOffRequests.filter((request) => request.status === "pending"),
    [adminTimeOffRequests],
  );
  const recentRequests = useMemo(
    () => [...adminTimeOffRequests].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 12),
    [adminTimeOffRequests],
  );

  if (role !== "admin") {
    return (
      <Card className="p-5">
        <p className="text-sm text-white/50">CEO access is required to manage company holidays and approve employee days off.</p>
      </Card>
    );
  }

  const handleSaveHoliday = async () => {
    setIsSaving(true);
    setMessage(null);
    setActionError(null);
    try {
      if (editingHolidayId) {
        await updateHoliday(editingHolidayId, holidayForm);
        setMessage("Holiday updated.");
      } else {
        await createHoliday(holidayForm);
        setMessage("Holiday added.");
      }
      setEditingHolidayId(null);
      setHolidayForm(emptyHoliday);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Failed to save holiday.");
    } finally {
      setIsSaving(false);
    }
  };

  const openHoliday = (holiday: HolidayRecord) => {
    setEditingHolidayId(holiday.id);
    setHolidayForm({ date: holiday.date, name: holiday.name });
  };

  const handleReview = async (id: string, status: "approved" | "rejected" | "cancelled") => {
    setMessage(null);
    setActionError(null);
    try {
      await reviewTimeOffRequest(id, { status });
      setMessage(`Request ${status}.`);
    } catch (reviewError) {
      setActionError(reviewError instanceof Error ? reviewError.message : "Failed to update request.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white">Holidays</h2>
        <p className="mt-1 text-sm text-white/50">
          Company holidays are global non-working days. Employee days off are approved individually and consume the April-to-March allowance of {timeOffPolicy?.maxDaysPerYear ?? 0} days.
        </p>
      </div>

      {(error || actionError || message) && (
        <Card className={`${error || actionError ? "border-red-500/20 bg-red-500/10" : "border-emerald-500/20 bg-emerald-500/10"} p-4`}>
          <p className={`text-sm font-semibold ${error || actionError ? "text-red-300" : "text-emerald-300"}`}>
            {error || actionError || message}
          </p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{editingHolidayId ? "Edit Company Holiday" : "Add Company Holiday"}</h3>
              <p className="mt-1 text-xs text-white/50">These dates are excluded from schedule-based accrual for everyone.</p>
            </div>
            {editingHolidayId && (
              <button
                type="button"
                onClick={() => {
                  setEditingHolidayId(null);
                  setHolidayForm(emptyHoliday);
                }}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08]"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <input
              type="date"
              value={holidayForm.date}
              onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))}
              className={inputCls}
            />
            <input
              value={holidayForm.name}
              onChange={(event) => setHolidayForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Holiday name"
              className={inputCls}
            />
            <button
              type="button"
              disabled={isSaving || !holidayForm.date || !holidayForm.name}
              onClick={() => {
                void handleSaveHoliday();
              }}
              className="rounded-xl bg-[#fc72ff] px-4 py-2.5 text-sm font-medium text-[#0d0e0f] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : editingHolidayId ? "Save Holiday" : "Add Holiday"}
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {loading && holidayRecords.length === 0 ? (
              <p className="text-sm text-white/50">Loading holidays…</p>
            ) : (
              holidayRecords.map((holiday) => (
                <button
                  key={holiday.id}
                  type="button"
                  onClick={() => openHoliday(holiday)}
                  className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{holiday.name}</p>
                    <p className="mt-1 text-xs text-white/40">{holiday.date}</p>
                  </div>
                  <span className="text-xs font-medium text-[#fc72ff]">Edit</span>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Pending Approvals</h3>
          <p className="mt-1 text-xs text-white/50">{pendingRequests.length} employee requests awaiting CEO review.</p>
          <div className="mt-4 space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-white/50">No pending time-off requests.</p>
            ) : (
              pendingRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{request.employeeName ?? request.employeeId}</p>
                      <p className="mt-1 text-xs text-white/40">{request.date}</p>
                      {request.note && <p className="mt-2 text-sm text-white/60">{request.note}</p>}
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleReview(request.id, "approved");
                      }}
                      className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleReview(request.id, "rejected");
                      }}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08]"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Recent Employee Time Off</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Employee</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">Note</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/40">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {recentRequests.map((request) => (
                <tr key={request.id}>
                  <td className="px-5 py-3 text-sm font-medium text-white">{request.employeeName ?? request.employeeId}</td>
                  <td className="px-5 py-3 text-sm text-white/60">{request.date}</td>
                  <td className="px-5 py-3 text-sm text-white/60">{request.note || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge variant={statusVariant(request.status)}>
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
