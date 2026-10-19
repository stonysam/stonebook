import { describe, expect, it } from 'vitest';
import { toIcs } from '../lib/ics';

describe('the calendar file', () => {
  const ics = toIcs([
    { uid: 'rule-1', title: 'Kia: Tyres changed, winter', date: '2026-11-05', description: 'Last done 2026-05-05; every 6 months.', url: '/things/kia' },
    { uid: 'slot-1-2026-10-22', title: 'Scouts (Lucy): you do pick-up', start: { date: '2026-10-22', time: '17:00' }, end: { date: '2026-10-22', time: '19:00' }, url: '/things/scouts' },
    { uid: 'long', title: 'Ř'.repeat(60), date: '2026-12-01', url: '/' },
  ], { name: 'Stonebook (Sam)', origin: 'https://stonebook-mu.vercel.app', now: new Date('2026-10-19T08:00:00Z') });
  const lines = ics.split('\r\n');

  it('has all-day due dates and timed activities in UTC', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261105');
    expect(lines).toContain('DTEND;VALUE=DATE:20261106');
    expect(lines).toContain('DTSTART:20261022T150000Z');
    expect(lines).toContain('DTEND:20261022T170000Z');
    expect(lines).toContain('SUMMARY:Kia: Tyres changed\\, winter');
    expect(lines).toContain('URL:https://stonebook-mu.vercel.app/things/scouts');
  });

  it('follows the format: CRLF, folded long lines, one calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).toContain('\r\n Ř');
  });
});
