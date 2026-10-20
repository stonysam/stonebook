import { describe, expect, it } from 'vitest';
import { nowIn, zonedToUtc } from '../src/engine/dates';
import { calendarFor, liftNotices, morningSummary, noticesFor, recipientsOf, type PlanData, type PRule } from '../src/engine/plan';

const rule = (id: string, object_id: string, extra: Partial<PRule>): PRule => ({
  id, object_id, name: 'Done', kind: 'interval', event_kind: 'Done', every_months: null, every_days: null, meter_every: null,
  meter_unit: null, due_on: null, renew_every_months: null, starts_on: null, meter_start: null, weekdays: null, owner_id: 'sam',
  lead_days: [14, 1], overdue_repeat_days: 7, active: true, created_at: '2026-10-01T08:00:00Z', ...extra,
});
const obj = (id: string, name: string, owner_id: string, created_by = 'sam') =>
  ({ id, name, owner_id, created_by, object_type_id: 't', archived_at: null });

// Thursday 22 October 2026
const TODAY = '2026-10-22';
const data = (): PlanData => ({
  members: [
    { id: 'sam', display_name: 'Sam', role: 'parent' }, { id: 'crystal', display_name: 'Crystal', role: 'parent' },
    { id: 'lucy', display_name: 'Lucy', role: 'junior' }, { id: 'benji', display_name: 'Benji', role: 'child' },
  ],
  objects: [obj('kia', 'Kia', 'crystal'), obj('hens', 'Feed the hens', 'benji', 'crystal'), obj('scouts', 'Scouts', 'lucy', 'lucy')],
  types: [{ id: 't', name: 'Chore or task', assignable: true }],
  rules: [
    rule('tyres', 'kia', { name: 'Tyres changed', event_kind: 'Tyres changed', every_months: 6, starts_on: '2026-05-05', owner_id: 'sam' }),
    rule('hens', 'hens', { kind: 'weekly', weekdays: [4], owner_id: 'benji', lead_days: [1] }),
  ],
  events: [],
  slots: [{ id: 'sl', object_id: 'scouts', weekdays: [4], starts_at: '17:00:00', ends_at: '19:00:00', drop_off_by: 'crystal', pick_up_by: 'sam', active: true }],
  changes: [],
});

describe('who hears about it', () => {
  it('Benji has no phone, so his chores go to the parent who set them', () => {
    const d = data();
    expect(recipientsOf(d, d.rules[1])).toEqual(['crystal']);
    expect(recipientsOf(d, d.rules[0])).toEqual(['sam']);
  });
});

describe('the morning summary', () => {
  it('lists what is due, what is coming up on its reminder days, and lifts', () => {
    const d = data();
    const sam = morningSummary(d, 'sam', TODAY)!;
    expect(sam.title).toBe('Today’s plans');
    expect(sam.body).toBe('17:00 Scouts (Lucy), you do pick-up 19:00\nKia: Tyres changed in 14 days');
    const crystal = morningSummary(d, 'crystal', TODAY)!;
    expect(crystal.title).toBe('Today: 1 thing to do');
    expect(crystal.body).toBe('Feed the hens (Benji)\n17:00 Scouts (Lucy), you do drop-off 17:00');
    expect(morningSummary(d, 'lucy', TODAY)!.body).toBe('17:00 Scouts');
  });

  it('says nothing when there is nothing to say, and nothing on a cancelled day', () => {
    const d = data();
    d.changes = [{ slot_id: 'sl', on_date: TODAY, cancelled: true, drop_off_by: null, pick_up_by: null, note: null }];
    expect(morningSummary(d, 'lucy', TODAY)).toBeNull();
  });

  it('only goes out between 7:00 and 11:00', () => {
    const d = data();
    expect(noticesFor(d, 'lucy', { date: TODAY, minutes: 6 * 60 + 59 })).toEqual([]);
    expect(noticesFor(d, 'lucy', { date: TODAY, minutes: 7 * 60 })).toHaveLength(1);
    expect(noticesFor(d, 'lucy', { date: TODAY, minutes: 11 * 60 })).toEqual([]);
  });
});

describe('lift heads-ups', () => {
  it('go to the driver from 45 minutes before', () => {
    const d = data();
    expect(liftNotices(d, 'sam', TODAY, 18 * 60 + 14)).toEqual([]);
    expect(liftNotices(d, 'sam', TODAY, 18 * 60 + 15)).toEqual([{
      key: `lift:sl:${TODAY}:pick`, title: 'Pick up Lucy from Scouts at 19:00', body: 'Scouts finishes at 19:00.', url: '/things/scouts',
    }]);
    expect(liftNotices(d, 'sam', TODAY, 19 * 60)).toEqual([]);
    expect(liftNotices(d, 'crystal', TODAY, 16 * 60 + 30)[0].title).toBe('Drop Lucy at Scouts by 17:00');
  });

  it('follow a change for that day', () => {
    const d = data();
    d.changes = [{ slot_id: 'sl', on_date: TODAY, cancelled: false, drop_off_by: 'crystal', pick_up_by: 'crystal', note: 'Late finish' }];
    expect(liftNotices(d, 'sam', TODAY, 18 * 60 + 30)).toEqual([]);
    expect(liftNotices(d, 'crystal', TODAY, 18 * 60 + 30)[0].body).toBe('Late finish');
  });
});

describe('the calendar feed', () => {
  it('has Lucy’s scouts every Thursday for eight weeks, and Sam’s pick-ups', () => {
    const d = data();
    const lucy = calendarFor(d, 'lucy', TODAY);
    const scouts = lucy.filter((e) => e.uid.startsWith('slot-'));
    expect(scouts.length).toBe(10); // last week, today and eight more weeks
    expect(scouts[1]).toMatchObject({ title: 'Scouts', start: { date: TODAY, time: '17:00' }, end: { date: TODAY, time: '19:00' } });
    expect(calendarFor(d, 'sam', TODAY).find((e) => e.uid === `slot-sl-${TODAY}`)?.title).toBe('Scouts (Lucy): you do pick-up');
  });

  it('has the next due date of a reminder, and every set day of a chore', () => {
    const d = data();
    expect(calendarFor(d, 'sam', TODAY).find((e) => e.uid === 'rule-tyres')).toMatchObject({ title: 'Kia: Tyres changed', date: '2026-11-05' });
    const hens = calendarFor(d, 'crystal', TODAY).filter((e) => e.uid.startsWith('rule-hens'));
    expect(hens[0]).toMatchObject({ title: 'Feed the hens (Benji)', date: TODAY });
    expect(hens).toHaveLength(9);
  });
});

describe('Prague time', () => {
  it('turns local times into instants, through the clock change', () => {
    expect(zonedToUtc('2026-10-22', '17:00').toISOString()).toBe('2026-10-22T15:00:00.000Z'); // summer time
    expect(zonedToUtc('2026-11-05', '17:00').toISOString()).toBe('2026-11-05T16:00:00.000Z'); // winter time
    expect(zonedToUtc('2026-10-25', '07:00').toISOString()).toBe('2026-10-25T06:00:00.000Z'); // the morning clocks go back
  });

  it('reads the family clock', () => {
    expect(nowIn('Europe/Prague', new Date('2026-10-22T05:00:00Z'))).toEqual({ date: TODAY, minutes: 7 * 60 });
  });
});

describe('set-day chores', () => {
  it('are on today’s list on their days even after missed ones, but not once done today', () => {
    const d = data();
    d.rules[1].created_at = '2026-09-01T08:00:00Z';
    expect(morningSummary(d, 'crystal', TODAY)!.body).toContain('Feed the hens (Benji)');
    d.events = [{ id: 'e', object_id: 'hens', kind: 'Done', occurred_on: TODAY, meter_value: null, meter_unit: null, data: {}, created_by: 'crystal', created_at: '', rule_id: 'hens' }];
    expect(morningSummary(d, 'crystal', TODAY)!.body).not.toContain('Feed the hens');
  });
});

describe('the reminder function', () => {
  it('runs the same planning code as the app (run `npm run edge:sync` after changing src/engine)', async () => {
    const { readFileSync } = await import('node:fs');
    const { FILES, forDeno } = await import('../scripts/sync-edge.mjs');
    for (const f of FILES as string[]) {
      const src = readFileSync(new URL(`../src/engine/${f}`, import.meta.url), 'utf8');
      const copy = readFileSync(new URL(`../supabase/functions/remind/_engine/${f}`, import.meta.url), 'utf8');
      expect(copy, f).toBe(`// Generated from src/engine/${f} by scripts/sync-edge.mjs. Do not edit.\n${forDeno(src)}`);
    }
  });
});

describe('one-off appointments for several people', () => {
  it('the family dentist shows only on its date, for everyone going, with lifts', () => {
    const d = data();
    d.objects.push(obj('dentist', 'Dentist', 'crystal', 'crystal'));
    d.slots.push({ id: 'dn', object_id: 'dentist', weekdays: [5], starts_at: '15:00:00', ends_at: '16:30:00', drop_off_by: 'crystal',
      pick_up_by: null, active: true, on_date: '2026-10-23', people: ['sam', 'crystal', 'lucy', 'benji'] });
    expect(morningSummary(d, 'lucy', '2026-10-23')!.body).toBe('15:00 Dentist (with the whole family)');
    expect(morningSummary(d, 'lucy', '2026-10-30')).toBeNull(); // next Friday: it was a one-off
    expect(liftNotices(d, 'crystal', '2026-10-23', 14 * 60 + 20)[0].title).toBe('Drop Sam, Lucy and Benji at Dentist by 15:00');
    expect(calendarFor(d, 'benji', '2026-10-20').filter((e) => e.uid.startsWith('slot-dn'))).toHaveLength(1);
  });

  it('an appointment with no time set shows all day, without a lift heads-up', () => {
    const d = data();
    d.objects.push(obj('fair', 'School fair', 'crystal', 'crystal'));
    d.slots.push({ id: 'sf', object_id: 'fair', weekdays: [5], starts_at: null, ends_at: null, drop_off_by: 'crystal',
      pick_up_by: null, active: true, on_date: '2026-10-23', people: ['lucy'] });
    expect(morningSummary(d, 'lucy', '2026-10-23')!.body).toBe('School fair');
    expect(morningSummary(d, 'crystal', '2026-10-23')!.body).toBe('School fair (Lucy), you do drop-off');
    expect(liftNotices(d, 'crystal', '2026-10-23', 9 * 60)).toHaveLength(0);
    const entry = calendarFor(d, 'lucy', '2026-10-20').find((e) => e.uid.startsWith('slot-sf'))!;
    expect(entry.date).toBe('2026-10-23');
    expect(entry.start).toBeUndefined();
  });
});
