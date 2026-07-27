/**
 * Timezone-aware calendar-date helpers for the Planner. All bucketing must
 * key off an explicit IANA timezone (Profile.timezone) via
 * Intl.DateTimeFormat, matching the backend's own day-boundary logic
 * (app.services.planner._day_bounds_utc) — never the device timezone,
 * never ISO-string slicing.
 *
 * Range/grid arithmetic below (addDaysToDateString, monthGridDates, etc.)
 * operates purely on YYYY-MM-DD strings via Date.UTC/getUTC* accessors —
 * deliberately never touching device-local Date getters/setters, so it
 * can't reintroduce a device-timezone dependency.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats a UTC instant into YYYY-MM-DD in an explicit IANA timezone.
 * Uses formatToParts (not a locale's default string shape) so the output
 * doesn't depend on ICU/locale formatting quirks. */
export function toZonedDateString(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** dateString +/- N days, as a calendar date (no timezone involved — pure
 * UTC-anchored arithmetic on the date string itself). */
export function addDaysToDateString(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Inclusive list of YYYY-MM-DD strings from firstDate through lastDate. */
export function zonedDateRange(firstDate: string, lastDate: string): string[] {
  const [fy, fm, fd] = firstDate.split('-').map(Number);
  const [ly, lm, ld] = lastDate.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ly, lm - 1, ld);
  const days: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const dt = new Date(t);
    days.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
  }
  return days;
}

/** Every local (Profile.timezone) date a StudyBlock overlaps, matching the
 * backend's half-open [starts_at, ends_at) semantics: the last date is
 * derived from ends_at minus 1ms so an exact-boundary end doesn't spill
 * into a day the block doesn't actually occupy. */
export function zonedDatesForBlock(startsAt: string, endsAt: string, timeZone: string): string[] {
  const first = toZonedDateString(new Date(startsAt), timeZone);
  const last = toZonedDateString(new Date(new Date(endsAt).getTime() - 1), timeZone);
  return zonedDateRange(first, last);
}

/** Monday-first weekday index (0=Mon..6=Sun) for a YYYY-MM-DD string,
 * computed via UTC so it never depends on device timezone. */
function mondayIndexUTC(dateString: string): number {
  const [y, m, d] = dateString.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (utcDay + 6) % 7;
}

/** The Monday of the Mon-Sun week containing dateString. */
export function mondayOfWeekContaining(dateString: string): string {
  return addDaysToDateString(dateString, -mondayIndexUTC(dateString));
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Full Monday-first month grid: leading days from the previous month,
 * the month itself, and trailing days from the next month, padded to
 * complete weeks (35 or 42 cells). */
export function monthGridDates(year: number, month1to12: number): string[] {
  const firstOfMonth = `${year}-${pad(month1to12)}-01`;
  const leadingCount = mondayIndexUTC(firstOfMonth);
  const totalDays = daysInMonth(year, month1to12);
  const gridStart = addDaysToDateString(firstOfMonth, -leadingCount);
  const cellsSoFar = leadingCount + totalDays;
  const trailingCount = (7 - (cellsSoFar % 7)) % 7;
  const gridEnd = addDaysToDateString(firstOfMonth, totalDays - 1 + trailingCount);
  return zonedDateRange(gridStart, gridEnd);
}

export function monthLabel(year: number, month1to12: number): string {
  return new Date(Date.UTC(year, month1to12 - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Formats a UTC instant as a calendar-meaningful date+time in an
 * explicit IANA timezone — used for history timestamps (Focus session
 * history), which are calendar displays, not device-default formatting
 * and never ISO-sliced. */
export function formatZonedDateTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}
