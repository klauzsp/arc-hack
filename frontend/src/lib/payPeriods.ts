export function currentPeriodStart(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const startDay = day <= 15 ? 1 : 16;
  return new Date(Date.UTC(year, month - 1, startDay, 12)).toISOString().slice(0, 10);
}

export function currentPeriodEnd(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  if (day <= 15) {
    return new Date(Date.UTC(year, month - 1, 15, 12)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}

export function yearStart(today: string) {
  const [year] = today.split("-").map(Number);
  return new Date(Date.UTC(year, 0, 1, 12)).toISOString().slice(0, 10);
}
