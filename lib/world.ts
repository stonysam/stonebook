// Everything the signed-in person can see, loaded once per request, plus the
// derived views the screens need. Row-level security has already filtered it,
// so nothing here decides who may see what.
import { cache } from 'react';
import { computeDue, type DueResult, type EventRecord, type Rule } from '@/src/engine/due';
import { daysBetween, todayIn } from '@/src/engine/dates';
import { getMe } from '@/lib/auth';
import type { AwaitingRow, EventRow, FieldDefRow, MemberRow, ObjectRow, ObjectTypeRow, RuleRow } from '@/lib/database.types';

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
}

export const loadWorld = cache(async (): Promise<World> => {
  const { supabase, me } = await getMe();
  const [members, types, fields, objects, rules, events, awaiting] = await Promise.all([
    supabase.from('members').select('*').order('created_at'),
    supabase.from('object_types').select('*').order('sort_order'),
    supabase.from('field_defs').select('*').order('sort_order'),
    supabase.from('objects').select('*').order('name'),
    supabase.from('rules').select('*').eq('active', true),
    supabase.from('effective_events').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('awaiting_confirmation').select('*').order('created_at'),
  ]);
  for (const r of [members, types, fields, objects, rules, events, awaiting]) {
    if (r.error) throw new Error(r.error.message);
  }
  return {
    me,
    today: todayIn('Europe/Prague'),
    members: members.data ?? [],
    types: types.data ?? [],
    fields: fields.data ?? [],
    objects: objects.data ?? [],
    rules: rules.data ?? [],
    events: events.data ?? [],
    pending: awaiting.data ?? [],
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

export function dueFor(w: World, rule: RuleRow): DueRow | null {
  const object = w.objects.find((o) => o.id === rule.object_id);
  if (!object || object.archived_at) return null;
  const due = computeDue(toEngineRule(rule), eventsOf(w, object.id).map(toEngineEvent), w.today);
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
  w.me.role === 'parent' || ((w.me.role === 'member' || w.me.role === 'junior') && o.owner_id === w.me.id);

export const canLog = (w: World) => w.me.role !== 'child';
