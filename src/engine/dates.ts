// Calendar-date helpers. All dates are ISO "YYYY-MM-DD" strings with no time or
// time zone: a due date is a day on the family calendar, not an instant.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseDate(iso: string): { y: number; m: number; d: number } {
  const match = ISO.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Impossible date: ${iso}`);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day number since 1970-01-01, for differences and comparisons. */
export function dayNumber(iso: string): number {
  const { y, m, d } = parseDate(iso);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNumber(n: number): string {
  const dt = new Date(n * DAY_MS);
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

/**
 * Adds calendar months, clamping to the last day of the month:
 * 2026-01-31 + 1 month = 2026-02-28. Always compute from the original anchor
 * (anchor + k months) rather than chaining, so 31 Jan -> 28 Feb -> 31 Mar.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseDate(iso);
  const zeroBased = m - 1 + months;
  const ny = y + Math.floor(zeroBased / 12);
  const nm = ((zeroBased % 12) + 12) % 12 + 1;
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  return ((dayNumber(iso) + 3) % 7 + 7) % 7 + 1;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

export function minDate(...dates: (string | null | undefined)[]): string | null {
  const present = dates.filter((d): d is string => !!d);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a <= b ? a : b));
}

/** Today's date on the family's calendar (Europe/Prague), regardless of server time zone. */
export function todayIn(timeZone = 'Europe/Prague', now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
