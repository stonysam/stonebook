import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ getMe: vi.fn() }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }));

const { dueFor, suggestedKinds, toEngineRule, canEditObject, recentThings, sessionsOn, choresOf, kidToday } = await import('../lib/world');
const { whenText } = await import('../lib/format');
import type { EventRow, MemberRow, ObjectRow, RuleRow } from '../lib/database.types';
import type { World } from '../lib/world';

const member = (id: string, role: MemberRow['role']): MemberRow =>
  ({ id, display_name: id, role, email: null, auth_user_id: null, created_at: '2026-10-01T00:00:00Z', color: null });
const object = (id: string, owner: string, extra: Partial<ObjectRow> = {}): ObjectRow => ({
  id, object_type_id: 't-' + (extra.name ?? 'thing'), name: id, owner_id: owner, visibility: 'shared', share_with_family: false,
  field_values: {}, archived_at: null, created_by: owner, created_at: '2026-10-01T00:00:00Z', is_group: false, parent_id: null, ...extra,
});
const rule = (id: string, objectId: string, extra: Partial<RuleRow>): RuleRow => ({
  id, object_id: objectId, name: 'Rule', kind: 'interval', event_kind: 'Done', every_months: null, every_days: null,
  meter_every: null, meter_unit: null, due_on: null, renew_every_months: null, starts_on: null, meter_start: null,
  weekdays: null, owner_id: 'sam', lead_days: [14, 1], overdue_repeat_days: 7, active: true, created_by: 'sam',
  created_at: '2026-10-18T08:00:00Z', completion: 'log', ...extra,
});
const event = (id: string, objectId: string, kind: string, on: string): EventRow => ({
  id, object_id: objectId, kind, occurred_on: on, meter_value: null, meter_unit: null, data: {}, note: null,
  correction_of: null, voided: false, created_by: 'sam', created_at: on + 'T10:00:00Z', needs_confirmation: false, root_id: id, rule_id: null,
});

function world(rules: RuleRow[], events: EventRow[], me = member('sam', 'parent')): World {
  return {
    me, today: '2026-10-18', members: [member('sam', 'parent'), member('lucy', 'junior')], types: [], fields: [],
    objects: [object('car', 'sam'), object('hens', 'lucy'), object('chain', 'sam')], rules, events, pending: [], slots: [], changes: [],
  };
}

describe('the Today list', () => {
  it('sorts reminders into overdue, this week and this month', () => {
    const w = world([
      rule('oil', 'car', { every_months: 12, event_kind: 'Oil change' }),
      rule('feed', 'hens', { kind: 'weekly', weekdays: [2, 5] }),
      rule('sharpen', 'chain', { every_months: 1, event_kind: 'Sharpened' }),
    ], [event('e1', 'car', 'oil change', '2025-10-06'), event('e2', 'chain', 'sharpened', '2026-10-01')]);
    expect(dueFor(w, w.rules[0])?.bucket).toBe('overdue');
    expect(dueFor(w, w.rules[1])?.bucket).toBe('week'); // Tue 20 Oct
    expect(dueFor(w, w.rules[2])?.bucket).toBe('month'); // 1 Nov
  });

  it('a weekly chore with no start date starts the day it was set up (Prague time)', () => {
    expect(toEngineRule(rule('r', 'hens', { kind: 'weekly', weekdays: [1], created_at: '2026-10-18T22:30:00Z' })).startsOn).toBe('2026-10-19');
  });

  it('archived things drop out', () => {
    const w = world([rule('oil', 'car', { every_months: 12 })], []);
    w.objects[0].archived_at = '2026-10-18T00:00:00Z';
    expect(dueFor(w, w.rules[0])).toBeNull();
  });
});

describe('quick log suggestions', () => {
  it('rule kinds first, then past kinds, without repeats', () => {
    const w = world([rule('oil', 'car', { event_kind: 'Oil change', every_months: 12 })],
      [event('1', 'car', 'Headlight bulb changed', '2026-02-03'), event('2', 'car', 'oil change', '2025-10-06'), event('3', 'car', 'Battery replaced', '2025-09-02')]);
    expect(suggestedKinds(w, 'car')).toEqual(['Oil change', 'Headlight bulb changed', 'Battery replaced']);
  });
});

describe('who can edit', () => {
  it('parents edit anything; a junior only their own', () => {
    const w = world([], [], member('lucy', 'junior'));
    expect(canEditObject(w, w.objects[0])).toBe(false);
    expect(canEditObject(w, w.objects[1])).toBe(true);
  });
});

describe('due wording', () => {
  it('reads naturally', () => {
    expect(whenText('2026-10-06', '2026-10-18')).toBe('12 days overdue');
    expect(whenText('2026-10-18', '2026-10-18')).toBe('Due today');
    expect(whenText('2026-10-19', '2026-10-18')).toBe('Tomorrow');
    expect(whenText('2026-10-23', '2026-10-18')).toBe('Fri 23 Oct');
    expect(whenText('2026-11-14', '2026-10-18')).toBe('14 Nov');
    expect(whenText('2027-03-03', '2026-10-18')).toBe('3 Mar 2027');
  });
});

describe('turns (dishes on different days for different people)', () => {
  const dishes = (events: EventRow[]) => {
    const w = world([
      rule('marley', 'hens', { kind: 'weekly', weekdays: [2, 7], owner_id: 'marley', event_kind: 'Done', created_at: '2026-10-19T08:00:00Z' }),
      rule('lucy', 'hens', { kind: 'weekly', weekdays: [1, 4], owner_id: 'lucy', event_kind: 'Done', created_at: '2026-10-19T08:00:00Z' }),
    ], events);
    w.today = '2026-10-21'; // Wednesday
    return w;
  };

  it('each turn only counts its own person\'s entries', () => {
    const w = dishes([{ ...event('e1', 'hens', 'Done', '2026-10-20'), created_by: 'lucy' }]);
    expect(dueFor(w, w.rules[0])?.due.dueOn).toBe('2026-10-20'); // Marley's Tuesday still open
    expect(dueFor(w, w.rules[0])?.bucket).toBe('overdue');
    expect(dueFor(w, w.rules[1])?.due.dueOn).toBe('2026-10-22'); // Lucy's next is Thursday
  });

  it('covering someone\'s turn counts for them', () => {
    const w = dishes([{ ...event('e1', 'hens', 'Done', '2026-10-20'), created_by: 'lucy', rule_id: 'marley' }]);
    expect(dueFor(w, w.rules[0])?.due.dueOn).toBe('2026-10-25');
  });

  it('a person page lists only their turns', () => {
    const w = dishes([]);
    w.types = [{ id: 't-thing', name: 'Chore or task', icon: null, sort_order: 0, confirm_kid_logs: true, assignable: true, groups: false, created_at: '' }];
    expect(choresOf(w, 'marley').map((c) => c.rules.map((r) => r.id))).toEqual([['marley']]);
    expect(choresOf(w, 'sam').map((c) => c.object.id)).not.toContain('hens');
  });
});

describe('a one-off task', () => {
  it('done early still counts as done', () => {
    const w = world([rule('t', 'chain', { kind: 'fixed_date', due_on: '2026-10-25', starts_on: '2026-10-18', lead_days: [1], event_kind: 'Done' })],
      [event('e', 'chain', 'Done', '2026-10-19')]);
    expect(dueFor(w, w.rules[0])?.due.status).toBe('done');
  });
});

describe('recent things', () => {
  it('what you logged lately comes first, then what you look after', () => {
    const w = world([], [event('e1', 'chain', 'Sharpened', '2026-10-17'), { ...event('e2', 'hens', 'Fed', '2026-10-18'), created_by: 'lucy' }]);
    expect(recentThings(w).map((o) => o.id)).toEqual(['chain', 'car']);
  });
});

describe('activities', () => {
  it('a date change overrides the usual drivers', () => {
    const w = world([], []);
    w.slots = [{ id: 's', object_id: 'hens', weekdays: [4], starts_at: '17:00:00', ends_at: '19:00:00', drop_off_by: 'crystal', pick_up_by: 'sam', active: true, created_by: 'lucy', created_at: '', on_date: null, people: [] }];
    w.changes = [{ slot_id: 's', on_date: '2026-10-29', cancelled: false, drop_off_by: 'sam', pick_up_by: 'sam', note: null, changed_by: 'sam', changed_at: '' }];
    expect(sessionsOn(w, '2026-10-22')[0]).toMatchObject({ startsAt: '17:00', endsAt: '19:00', dropOffBy: 'crystal', changed: false });
    expect(sessionsOn(w, '2026-10-29')[0]).toMatchObject({ dropOffBy: 'sam', changed: true });
    expect(sessionsOn(w, '2026-10-23')).toEqual([]);
  });
});

describe('Benji’s screen', () => {
  it('shows today’s chores to do, waiting, or done, and counts this week’s approved ones as stars', () => {
    const w = world([
      rule('bed', 'hens', { kind: 'weekly', weekdays: [7], owner_id: 'benji', created_at: '2026-10-18T06:00:00Z' }),
      rule('toys', 'chain', { kind: 'weekly', weekdays: [7], owner_id: 'benji', created_at: '2026-10-18T06:00:00Z' }),
      rule('later', 'car', { kind: 'weekly', weekdays: [3], owner_id: 'benji', created_at: '2026-10-18T06:00:00Z' }),
    ], [{ ...event('e1', 'chain', 'Done', '2026-10-18'), created_by: 'benji' }, { ...event('e0', 'hens', 'Done', '2026-10-11'), created_by: 'benji' }]);
    w.objects[1].field_values = { picture: 'hens' };
    const { chores, starsThisWeek } = kidToday(w, 'benji'); // Sunday 18 Oct
    expect(chores.map((c) => [c.object.id, c.state])).toEqual([['hens', 'todo'], ['chain', 'done']]);
    expect(chores[0].picture).toBe('hens');
    expect(starsThisWeek).toBe(1); // Sunday 11th was last week
  });
});
