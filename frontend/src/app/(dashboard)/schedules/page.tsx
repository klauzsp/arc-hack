"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { usePayroll } from "@/components/PayrollProvider";
import type { Schedule } from "@/lib/types";

const dayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

type ScheduleForm = Omit<Schedule, "id">;

const emptyForm: ScheduleForm = {
  name: "",
  timezone: "America/New_York",
  startTime: "09:00",
  hoursPerDay: 8,
  workingDays: [1, 2, 3, 4, 5],
};

export default function SchedulesPage() {
  const { role } = useAuthSession();
  const {
    schedules,
    timeOffPolicy,
    createSchedule,
    updateSchedule,
    updateTimeOffPolicy,
    loading,
    error,
  } = usePayroll();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [limit, setLimit] = useState(String(timeOffPolicy?.maxDaysPerYear ?? 20));
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (timeOffPolicy) {
      setLimit(String(timeOffPolicy.maxDaysPerYear));
    }
  }, [timeOffPolicy?.maxDaysPerYear]);

  const orderedSchedules = useMemo(
    () => [...schedules].sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "")),
    [schedules],
  );

  if (role !== "admin") {
    return (
      <Card className="p-5">
        <p className="text-sm text-slate-500">CEO access is required to manage schedules and annual time-off limits.</p>
      </Card>
    );
  }

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (schedule: Schedule) => {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name ?? "",
      timezone: schedule.timezone ?? "America/New_York",
      startTime: schedule.startTime ?? "09:00",
      hoursPerDay: schedule.hoursPerDay,
      workingDays: schedule.workingDays,
    });
  };

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      workingDays: current.workingDays.includes(day)
        ? current.workingDays.filter((value) => value !== day)
        : [...current.workingDays, day].sort((left, right) => left - right),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    setActionError(null);
    try {
      if (editingId) {
        await updateSchedule(editingId, form);
        setMessage("Schedule updated.");
      } else {
        await createSchedule(form);
        setMessage("Schedule created.");
      }
      resetForm();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Failed to save schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLimitSave = async () => {
    setIsSaving(true);
    setMessage(null);
    setActionError(null);
    try {
      await updateTimeOffPolicy({ maxDaysPerYear: Number(limit) });
      setMessage("Annual time-off limit updated.");
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Failed to update time-off limit.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Define working hours for linear accrual and set the yearly day-off allowance the CEO will enforce from April 1 to March 31.
      </p>

      {(error || actionError || message) && (
        <Card className={`${error || actionError ? "border-red-200 bg-red-50/40" : "border-emerald-200 bg-emerald-50/40"} p-4`}>
          <p className={`text-sm font-semibold ${error || actionError ? "text-red-800" : "text-emerald-800"}`}>
            {error || actionError || message}
          </p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex-1 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Annual Day-Off Limit</span>
            <input
              type="number"
              min={1}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <button
            type="button"
            disabled={isSaving || Number(limit) <= 0}
            onClick={() => {
              void handleLimitSave();
            }}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200"
          >
            Save Limit
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Current policy: {timeOffPolicy?.maxDaysPerYear ?? 0} days per employee each April-to-March year.
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{editingId ? "Edit Schedule" : "New Schedule"}</h3>
            <p className="mt-1 text-xs text-slate-500">Start time and hours per day drive schedule-based earnings accrual second by second.</p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            value={form.name ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Schedule name"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={form.timezone ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            placeholder="America/New_York"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="time"
            value={form.startTime ?? "09:00"}
            onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="number"
            min={1}
            step={0.25}
            value={form.hoursPerDay}
            onChange={(event) => setForm((current) => ({ ...current, hoursPerDay: Number(event.target.value) || 0 }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            disabled={isSaving || !form.name || !form.timezone || !form.startTime || form.workingDays.length === 0}
            onClick={() => {
              void handleSave();
            }}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
          >
            {isSaving ? "Saving..." : editingId ? "Save Schedule" : "Create Schedule"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {dayOptions.map((day) => {
            const enabled = form.workingDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  enabled ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {loading && orderedSchedules.length === 0 ? (
          <div className="text-sm text-slate-500">Loading schedules…</div>
        ) : (
          orderedSchedules.map((schedule) => (
            <Card key={schedule.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{schedule.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{schedule.timezone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(schedule)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Edit
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Workday</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {schedule.startTime} start, {schedule.hoursPerDay} hrs
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Working Days</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {schedule.workingDays.map((day) => dayOptions.find((option) => option.value === day)?.label).join(", ")}
                  </p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
