import { addDays, daysBetween, parseDate } from '@/src/engine/dates';

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayDayMonth = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const longToday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const asDate = (iso: string) => {
  const { y, m, d } = parseDate(iso);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "12 days overdue", "Due today", "Tomorrow", "Fri 23 Oct", "14 Nov", "3 Mar 2027" */
export function whenText(dueOn: string | null, today: string): string {
  if (!dueOn) return '';
  const days = daysBetween(today, dueOn);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return weekdayDayMonth.format(asDate(dueOn)).replace(',', '');
  if (dueOn.slice(0, 4) === today.slice(0, 4)) return dayMonth.format(asDate(dueOn));
  return fullDate.format(asDate(dueOn));
}

/** "Today", "Yesterday", "3 Feb 2026" */
export function dateText(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return fullDate.format(asDate(iso));
}

export const todayHeading = (today: string) => longToday.format(asDate(today)).replace(',', '');

export function timeAgo(isoTimestamp: string, now = new Date()): string {
  const mins = Math.round((now.getTime() - new Date(isoTimestamp).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fullDate.format(new Date(isoTimestamp));
}

export const possessive = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

export const WEEKDAYS = [
  [1, 'Mo', 'Monday'], [2, 'Tu', 'Tuesday'], [3, 'We', 'Wednesday'], [4, 'Th', 'Thursday'],
  [5, 'Fr', 'Friday'], [6, 'Sa', 'Saturday'], [7, 'Su', 'Sunday'],
] as const;
