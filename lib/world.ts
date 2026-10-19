// Everything the signed-in person can see, loaded once per request, plus the
// derived views the screens need. Row-level security has already filtered it,
// so nothing here decides who may see what.
import { cache } from 'react';
import { computeDue, type DueResult, type EventRecord, type Rule } from '@/src/engine/due';
import { addDays, daysBetween, isoWeekday, todayIn } from '@/src/engine/dates';
import { getMe } from '@/lib/auth';
import { dayLabel } from '@/lib/format';
import type { ActivityChangeRow, ActivitySlotRow, AwaitingRow, EventRow, FieldDefRow, MemberRow, ObjectRow, ObjectTypeRow, RuleRow } from '@/lib/database.types';

export interface World {
  me: MemberRow;
  today: string;
  members: MemberRow[];
  types: ObjectTypeRow[];
  fields: FieldDefRow[];
  objects: ObjectRow[];
  rules: RuleRow[];
  events: EventRow[]; // effective events (corrections applied, unconfirmed excluded), newest first
  pending: AwaitingRow[]; // kids' entries still waiting for a parent
  slots: ActivitySlotRow[]; // weekly times of activities and work
  changes: ActivityChangeRow[]; // one-date changes from yesterday on
}

export const loadWorld = cache(async (): Promise<World> => {
  const { supabase, me } = await getMe();
  const today = todayIn('Europe/Prague');
  const [members, types, fields, objects, rules, events, awaiting, slots, changes] = await Promise.all([
    supabase.from('members').select('*').order('created_at'),
    supabase.from('object_types').select('*').order('sort_order'),
    supabase.from('field_defs').select('*').order('sort_order'),
    supabase.from('objects').select('*').order('name'),
    supabase.from('rules').select('*').eq('active', true),
    supabase.from('effective_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('awaiting_confirmation').select('*').order('created_at'),
    supabase.from('activity_slots').select('*').eq('active', true).order('starts_at'),
    supabase.from('activity_changes').select('*').gte('on_date', addDays(today, -1)),
  ]);
  for (const r of [members, types, fields, objects, rules, events, awaiting, slots, changes]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    me,
    today,
    members: members.data ?? [],
    types: types.data ?? [],
    fields: fields.data ?? [],
    objects: objects.data ?? [],
    rules: rules.data ?? [],
    events: events.data ?? [],
    pending: awaiting.data ?? [],
    slots: slots.data ?? [],
    changes: changes.data ?? [],
  };
});

export const memberName = (w: World, id: string | null | undefined) =>
  id === w.me.id ? 'You' : (w.members.find((m) => m.id === id)?.display_name ?? 'Someone');
export const typeOf = (w: World, o: ObjectRow) => w.types.find((t) => t.id === o.object_type_id);
export const eventsOf = (w: World, objectId: string) => w.events.filter((e) => e.object_id === objectId);

export function toEngineRule(r: RuleRow): Rule {
  return {
    id: r.id, kind: r.kind, eventKind: r.event_kind, everyMonths: r.every_months, everyDays: r.every_days,
    meterEvery: r.meter_every, meterUnit: r.meter_unit, dueOn: r.due_on, renewEveryMonths: r.renew_every_months,
    // A weekly chore with no start date starts the day it was set up.
    startsOn: r.starts_on ?? (r.kind === 'weekly' ? todayIn('Europe/Prague', new Date(r.created_at)) : null),
    meterStart: r.meter_start, weekdays: r.weekdays, leadDays: r.lead_days, overdueRepeatDays: r.overdue_repeat_days,
  };
}

export const toEngineEvent = (e: EventRow): EventRecord => ({
  id: e.id, kind: e.kind, occurredOn: e.occurred_on, meterValue: e.meter_value, meterUnit: e.meter_unit,
  data: (e.data ?? {}) as Record<string, unknown>, createdAt: e.created_at,
});

export interface DueRow {
  rule: RuleRow;
  object: ObjectRow;
  typeName: string;
  due: DueResult;
  bucket: 'overdue' | 'week' | 'month' | 'later' | 'setup' | 'none';
}

const sameKind = (a: string | null, b: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * The entries that count for a reminder. An entry that names its reminder counts only for it.
 * When an item has turns (the same job reminding different people, like dishes), an entry
 * that names none counts for the turn of whoever logged it.
 */
export function eventsForRule(w: World, rule: RuleRow): EventRow[] {
  const turns = w.rules.filter((r) => r.object_id === rule.object_id && r.kind !== 'record' && sameKind(r.event_kind, rule.event_kind));
  const hasTurns = new Set(turns.map((r) => r.owner_id)).size > 1;
  return eventsOf(w, rule.object_id).filter((e) =>
    e.rule_id ? e.rule_id === rule.id : !hasTurns || e.created_by === rule.owner_id);
}

export function dueFor(w: World, rule: RuleRow): DueRow | null {
  const object = w.objects.find((o) => o.id === rule.object_id);
  if (!object || object.archived_at) return null;
  const due = computeDue(toEngineRule(rule), eventsForRule(w, rule).map(toEngineEvent), w.today);
  let bucket: DueRow['bucket'] = 'none';
  if (due.status === 'never_done') bucket = 'setup';
  else if (due.dueOn && due.status !== 'done' && due.status !== 'record') {
    const days = daysBetween(w.today, due.dueOn);
    bucket = due.status === 'overdue' || days < 0 ? 'overdue' : days < 7 ? 'week' : days <= 31 ? 'month' : 'later';
  } else if (due.status === 'overdue') bucket = 'overdue';
  return { rule, object, typeName: typeOf(w, object)?.name ?? '', due, bucket };
}

export const allDue = (w: World) => w.rules.map((r) => dueFor(w, r)).filter((d): d is DueRow => d !== null);

/** Event kinds to offer when logging on an item: its rules first, then what's been logged on it before. */
export function suggestedKinds(w: World, objectId: string): string[] {
  const fromRules = w.rules.filter((r) => r.object_id === objectId && r.event_kind).map((r) => r.event_kind as string);
  const fromHistory = eventsOf(w, objectId).map((e) => e.kind);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...fromRules, ...fromHistory]) {
    const key = k.trim().toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(k.trim()); }
  }
  return out.slice(0, 8);
}

export const meterUnitFor = (w: World, objectId: string) =>
  w.rules.find((r) => r.object_id === objectId && r.meter_unit)?.meter_unit ?? null;

export const canEditObject = (w: World, o: ObjectRow) =>
  w.me.role === 'parent' || ((w.me.role === 'member' || w.me.role === 'junior')
    && (o.owner_id === w.me.id || (o.created_by === w.me.id && !!typeOf(w, o)?.assignable)));

export const canLog = (w: World) => w.me.role !== 'child';

/** Reminders on an item that are someone's turn, for the "Whose turn?" choice when logging. */
export function turnsOf(w: World, objectId: string): { ruleId: string; label: string; ownerId: string }[] {
  const rules = w.rules.filter((r) => r.object_id === objectId && r.kind !== 'record');
  if (new Set(rules.map((r) => r.owner_id)).size < 2) return [];
  return rules.map((r) => ({ ruleId: r.id, ownerId: r.owner_id, label: memberName(w, r.owner_id) }));
}

/** Things to jump back to: what you logged on or added lately, then what you look after. */
export function recentThings(w: World, n = 6): ObjectRow[] {
  const live = new Map(w.objects.filter((o) => !o.archived_at).map((o) => [o.id, o]));
  const touched = [
    ...w.events.filter((e) => e.created_by === w.me.id).map((e) => ({ id: e.object_id, at: e.created_at })),
    ...w.objects.filter((o) => o.created_by === w.me.id).map((o) => ({ id: o.id, at: o.created_at })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const out: ObjectRow[] = [];
  for (const id of [...touched.map((t) => t.id), ...w.objects.filter((o) => o.owner_id === w.me.id).map((o) => o.id)]) {
    const o = live.get(id);
    if (o && !out.includes(o)) out.push(o);
    if (out.length >= n) break;
  }
  return out;
}

export interface Session {
  slot: ActivitySlotRow;
  object: ObjectRow;
  date: string;
  startsAt: string; // HH:MM
  endsAt: string | null;
  dropOffBy: string | null;
  pickUpBy: string | null;
  cancelled: boolean;
  changed: boolean;
  note: string | null;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Activities and work happening on a date, with that date's changes applied, earliest first. */
export function sessionsOn(w: World, date: string, objectId?: string): Session[] {
  const day = isoWeekday(date);
  return w.slots
    .filter((s) => s.weekdays.includes(day) && (!objectId || s.object_id === objectId))
    .flatMap((slot) => {
      const object = w.objects.find((o) => o.id === slot.object_id);
      if (!object || object.archived_at) return [];
      const c = w.changes.find((x) => x.slot_id === slot.id && x.on_date === date);
      return [{
        slot, object, date, startsAt: hhmm(slot.starts_at)!, endsAt: hhmm(slot.ends_at),
        dropOffBy: c ? c.drop_off_by : slot.drop_off_by, pickUpBy: c ? c.pick_up_by : slot.pick_up_by,
        cancelled: c?.cancelled ?? false, changed: !!c, note: c?.note ?? null,
      }];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The next few dates an activity happens, from today. */
export function upcomingSessions(w: World, objectId: string, days = 21): Session[] {
  const out: Session[] = [];
  for (let i = 0; i < days; i++) out.push(...sessionsOn(w, addDays(w.today, i), objectId));
  return out;
}

/** Whether the signed-in person may change an item's activity times (the person or a parent). */
export const canEditActivity = (w: World, o: ObjectRow) =>
  w.me.role === 'parent' || ((w.me.role === 'member' || w.me.role === 'junior') && o.owner_id === w.me.id);

/** What the session cards need, worked out on the server. */
export function sessionView(w: World, s: Session) {
  return {
    slotId: s.slot.id, objectId: s.object.id, title: s.object.name, who: memberName(w, s.object.owner_id),
    date: s.date, dateLabel: dayLabel(s.date, w.today), time: s.endsAt ? `${s.startsAt}–${s.endsAt}` : s.startsAt,
    dropOffBy: s.dropOffBy, pickUpBy: s.pickUpBy, cancelled: s.cancelled, changed: s.changed, note: s.note,
  };
}

/** People who can drive (parents and the grown-up kids), and everyone's names, for the session cards. */
export function driverOptions(w: World) {
  return {
    drivers: w.members.filter((m) => m.role === 'parent' || m.role === 'member').map((m) => ({ id: m.id, name: memberName(w, m.id) })),
    names: Object.fromEntries(w.members.map((m) => [m.id, memberName(w, m.id)])),
  };
}

/** A person's chores and tasks: ones they look after, and turns they have on shared ones (dishes). */
export function choresOf(w: World, memberId: string): { object: ObjectRow; rules: RuleRow[] }[] {
  return w.objects
    .filter((o) => !o.archived_at && typeOf(w, o)?.assignable)
    .map((o) => {
      const all = w.rules.filter((r) => r.object_id === o.id);
      const mine = all.filter((r) => r.owner_id === memberId);
      return { object: o, rules: mine, counts: mine.length > 0 || (o.owner_id === memberId && all.length === 0) };
    })
    .filter((x) => x.counts)
    .map(({ object, rules }) => ({ object, rules }));
}
