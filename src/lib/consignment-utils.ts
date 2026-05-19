// Returns "YYYY-MM-DD" — 30 days from the given date.
export function computeNextReplenishmentDate(afterDate: Date): string {
  const d = new Date(afterDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
