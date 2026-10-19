// Writes an iCalendar (.ics) feed that Google Calendar, Apple Calendar and Outlook can subscribe to.
import type { CalendarEntry } from '@/src/engine/plan';
import { addDays, zonedToUtc } from '@/src/engine/dates';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (iso: string) => iso.replace(/-/g, '');

/** Lines longer than 75 bytes are folded, as the format requires (never splitting a character). */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function toIcs(entries: CalendarEntry[], opts: { name: string; origin: string; now?: Date }): string {
  const now = stamp(opts.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Black Wolf Farm//Stonebook//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`, 'X-WR-TIMEZONE:Europe/Prague', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of entries) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@stonebook`, `DTSTAMP:${now}`, `SUMMARY:${esc(e.title)}`);
    if (e.date) lines.push(`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(addDays(e.date, 1))}`, 'TRANSP:TRANSPARENT');
    if (e.start) lines.push(`DTSTART:${stamp(zonedToUtc(e.start.date, e.start.time))}`);
    if (e.end) lines.push(`DTEND:${stamp(zonedToUtc(e.end.date, e.end.time))}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push(`URL:${opts.origin}${e.url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
