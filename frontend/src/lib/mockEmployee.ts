import {
  CURRENT_PERIOD_END,
  CURRENT_PERIOD_START,
  MOCK_TODAY,
  YTD_START,
  mockHolidays,
  mockSchedules,
  seedTimeEntries,
} from "./mockPayrollEngine";

export const mockTimeEntries = seedTimeEntries;
export const mockWorkingDays = mockSchedules[0]?.workingDays ?? [1, 2, 3, 4, 5];
export { CURRENT_PERIOD_END, CURRENT_PERIOD_START, MOCK_TODAY, YTD_START, mockHolidays, mockSchedules };
