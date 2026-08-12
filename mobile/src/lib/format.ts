/** Formats an estimate in hours to a human-readable string.
 *  0 → "0 min", 0.5 → "30 min", 1 → "1 hour", 1.5 → "1 hr 30 min", 2 → "2 hours". */
export function formatEstimate(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${h} hr ${m} min`;
}
