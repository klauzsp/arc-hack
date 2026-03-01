"use client";

import { useMemo, useState } from "react";
import { useAuthSession } from "@/components/AuthProvider";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { usePayroll } from "@/components/PayrollProvider";
import { inputStyles } from "@/components/ui";
import type { HolidayRecord, TimeOffRequest } from "@/lib/types";

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

export default function HolidaysPage() {
  const { role } = useAuthSession();
  const {
    holidayRecords,
    adminTimeOffRequests,
    timeOffPolicy,
    createHoliday,
    updateHoliday,
    reviewTimeOffRequest,
    reviewTimeOffRequestGroup,
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

  const pendingByGroup = useMemo(() => {
    const map = new Map<string | null, TimeOffRequest[]>();
    for (const r of pendingRequests) {
      const key = r.requestGroupId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [pendingRequests]);

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

  const handleReviewGroup = async (groupId: string, status: "approved" | "rejected") => {
    setMessage(null);
    setActionError(null);
    try {
      await reviewTimeOffRequestGroup(groupId, { status });
      setMessage(`Group ${status}.`);
    } catch (reviewError) {
      setActionError(reviewError instanceof Error ? reviewError.message : "Failed to update group.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Time Off Controls"
        title="Holidays"
        description={`Company holidays are global non-working days. Employee days off are approved individually and consume the April-to-March allowance of ${timeOffPolicy?.maxDaysPerYear ?? 0} days.`}
      />

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
              <Button
                variant="outline"
                onClick={() => {
                  setEditingHolidayId(null);
                  setHolidayForm(emptyHoliday);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <input
              type="date"
              value={holidayForm.date}
              onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))}
              className={inputStyles}
            />
            <input
              value={holidayForm.name}
              onChange={(event) => setHolidayForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Holiday name"
              className={inputStyles}
            />
            <Button
              disabled={isSaving || !holidayForm.date || !holidayForm.name}
              onClick={() => {
                void handleSaveHoliday();
              }}
            >
              {isSaving ? "Saving..." : editingHolidayId ? "Save Holiday" : "Add Holiday"}
            </Button>
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
          <div className="mt-4 space-y-4">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-white/50">No pending time-off requests.</p>
            ) : (
              Array.from(pendingByGroup.entries()).map(([groupId, groupRequests]) => {
                const isGroup = groupId != null && groupRequests.length > 1;
                const employeeName = groupRequests[0]?.employeeName ?? groupRequests[0]?.employeeId ?? "";
                const dateRange =
                  groupRequests.length > 1
                    ? `${groupRequests[0]!.date} – ${groupRequests[groupRequests.length - 1]!.date}`
                    : groupRequests[0]!.date;
                return (
                  <div
                    key={groupId ?? `single-${groupRequests[0]!.id}`}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{employeeName}</p>
                        <p className="mt-1 text-xs text-white/40">
                          {isGroup ? `${groupRequests.length} days: ${dateRange}` : dateRange}
                        </p>
                        {groupRequests[0]?.note && (
                          <p className="mt-2 text-sm text-white/60">{groupRequests[0].note}</p>
                        )}
                      </div>
                      {isGroup && groupId != null && (
                        <div className="flex gap-2">
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => void handleReviewGroup(groupId, "approved")}
                          >
                            Approve all
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            onClick={() => void handleReviewGroup(groupId, "rejected")}
                          >
                            Decline all
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
                      {groupRequests.map((request) => (
                        <div
                          key={request.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2"
                        >
                          <span className="text-xs text-white/70">{request.date}</span>
                          <div className="flex gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-400 hover:bg-emerald-500/20"
                              onClick={() => void handleReview(request.id, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:bg-red-500/20"
                              onClick={() => void handleReview(request.id, "rejected")}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
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
