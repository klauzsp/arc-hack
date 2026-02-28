import type { Employee, TimeEntry } from "./mockTypes";

export const mockCurrentEmployee: Employee = {
  id: "r-2",
  walletAddress: "0x8b2ef3a24c6e8Bb1a5290AeD04269d9c4d",
  name: "Bob Smith",
  payType: "hourly",
  rate: 45,
  chainPreference: "Base",
  timeTrackingMode: "check_in_out",
  totalPaid: 5400,
  earnedToDate: 6480,
  availableToWithdraw: 1080,
};

export const mockTimeEntries: TimeEntry[] = [
  { id: "t-1", date: "2025-02-24", clockIn: "08:30", clockOut: "12:15" },
  { id: "t-2", date: "2025-02-24", clockIn: "13:00", clockOut: "17:30" },
  { id: "t-3", date: "2025-02-25", clockIn: "08:45", clockOut: "12:00" },
  { id: "t-4", date: "2025-02-25", clockIn: "13:00", clockOut: "17:15" },
  { id: "t-5", date: "2025-02-26", clockIn: "09:00", clockOut: "12:30" },
  { id: "t-6", date: "2025-02-26", clockIn: "13:15", clockOut: "17:45" },
  { id: "t-7", date: "2025-02-27", clockIn: "08:30", clockOut: "12:00" },
  { id: "t-8", date: "2025-02-27", clockIn: "13:00", clockOut: "17:00" },
];

export const mockWorkingDays = [1, 2, 3, 4, 5];
export const mockHolidays: string[] = [
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-05-26",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
];
