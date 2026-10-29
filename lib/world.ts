// Everything the signed-in person can see, loaded once per request, plus the
// derived views the screens need. Row-level security has already filtered it,
// so nothing here decides who may see what.
import { cache } from 'react';
import { computeDue, type DueResult } from '@/src/engine/due';
import * as plan from '@/src/engine/plan';
import { addDays, daysBetween, isoWeekday, todayIn } from '@/src/engine/dates';
import { getMe } from '@/lib/auth';
import { dayLabel } from '@/lib/format';
import { colorOf } from '@/lib/people';
import { isActivity, isChore } from '@/lib/types';
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

export const toEngineRule = plan.toEngineRule;
export const toEngineEvent = plan.toEngineEvent;

export interface DueRow {
  rule: RuleRow;
  object: ObjectRow;
  typeName: string;
  due: DueResult;
  bucket: 'overdue' | 'week' | 'month' | 'later' | 'setup' | 'none';
}

/** The entries that count for a reminder (see plan.eventsForRule: turns, and entries that name their turn). */
export const eventsForRule = (w: World, rule: RuleRow): EventRow[] => plan.eventsForRule(w.rules, w.events, rule);

/** Just the data the shared planning functions need. */
export const planData = (w: World): plan.PlanData => ({
  members: w.members, objects: w.objects, types: w.types, rules: w.rules, events: w.events, slots: w.slots, changes: w.changes,
});

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
  startsAt: string | null; // HH:MM, or null: no set time
  endsAt: string | null;
  dropOffBy: string | null;
  pickUpBy: string | null;
  cancelled: boolean;
  changed: boolean;
  note: string | null;
  people: string[];
}

/** Activities and work happening on a date, with that date's changes applied, earliest first. */
export function sessionsOn(w: World, date: string, objectId?: string): Session[] {
  return plan.sessionsOn(planData(w), date, objectId).map((s) => ({
    slot: w.slots.find((x) => x.id === s.slotId)!, object: w.objects.find((o) => o.id === s.objectId)!, date: s.date,
    startsAt: s.startsAt, endsAt: s.endsAt, dropOffBy: s.dropOffBy, pickUpBy: s.pickUpBy, cancelled: s.cancelled, changed: s.changed, note: s.note,
    people: s.people,
  }));
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
    slotId: s.slot.id, objectId: s.object.id, title: s.object.name, who: plan.namesOf(planData(w), s.people) || memberName(w, s.object.owner_id),
    people: s.people, color: colorOf(w.members, s.people[0]),
    date: s.date, dateLabel: dayLabel(s.date, w.today), time: !s.startsAt ? 'Any time' : s.endsAt ? `${s.startsAt}–${s.endsAt}` : s.startsAt,
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

export interface KidChore { rule: RuleRow; object: ObjectRow; state: 'todo' | 'waiting' | 'done'; picture: string | null }

/** A child's list for today on the family tablet: what's due, waiting for a parent, or done. */
export function kidToday(w: World, childId: string): { chores: KidChore[]; starsThisWeek: number } {
  const chores: KidChore[] = [];
  for (const rule of w.rules) {
    if (rule.owner_id !== childId || rule.kind === 'record') continue;
    const d = dueFor(w, rule);
    if (!d) continue;
    const doneToday = eventsForRule(w, rule).some((e) => e.occurred_on === w.today && e.created_by === childId);
    const waiting = w.pending.some((p) => p.object_id === rule.object_id && p.created_by === childId && p.occurred_on === w.today);
    const dueNow = !!d.due.dueOn && d.due.dueOn <= w.today && d.due.status !== 'done';
    if (!dueNow && !doneToday && !waiting) continue;
    const picture = ((d.object.field_values ?? {}) as Record<string, unknown>).picture;
    chores.push({ rule, object: d.object, state: waiting ? 'waiting' : doneToday ? 'done' : 'todo', picture: typeof picture === 'string' ? picture : null });
  }
  const order = { todo: 0, waiting: 1, done: 2 };
  chores.sort((a, b) => order[a.state] - order[b.state] || a.object.name.localeCompare(b.object.name));
  const monday = addDays(w.today, 1 - isoWeekday(w.today));
  const starsThisWeek = w.events.filter((e) => e.created_by === childId && e.occurred_on >= monday && !isSkipped(e)).length;
  return { chores, starsThisWeek };
}

/** An "abort mission" entry: closes someone's part of a group task without counting as doing it. */
export const isSkipped = (e: EventRow) => !!(e.data && typeof e.data === 'object' && (e.data as Record<string, unknown>).skipped === true);

/** Everyone with a reminder on this item, in family order (a group task has several). */
export const peopleOn = (w: World, objectId: string) =>
  w.members.filter((m) => w.rules.some((r) => r.object_id === objectId && r.owner_id === m.id && r.kind !== 'record')).map((m) => m.id);

const scheduleKey = (r: RuleRow) =>
  [r.kind, (r.event_kind ?? '').trim().toLowerCase(), r.every_months, r.every_days, r.meter_every, r.due_on, r.renew_every_months, (r.weekdays ?? []).join('.')].join('|');

/** Group jobs: the other people's reminders for the same job on the same schedule (not turns on different days). */
export const groupMates = (w: World, rule: RuleRow) =>
  w.rules.filter((r) => r.id !== rule.id && r.object_id === rule.object_id && r.kind !== 'record' && scheduleKey(r) === scheduleKey(rule));

export interface DueCard { key: string; rows: DueRow[]; object: ObjectRow; typeName: string; dueOn: string | null; bucket: DueRow['bucket']; people: string[]; donePeople: string[] }

/** Today's rows, with a group job's parts folded into one card. */
export function dueCards(w: World, rows: DueRow[]): DueCard[] {
  const cards = new Map<string, DueCard>();
  for (const d of rows) {
    const mates = groupMates(w, d.rule);
    const key = mates.length ? `${d.object.id}|${scheduleKey(d.rule)}|${d.due.dueOn}` : d.rule.id;
    const card = cards.get(key) ?? {
      key, rows: [], object: d.object, typeName: d.typeName, dueOn: d.due.dueOn, bucket: d.bucket, people: [], donePeople: [],
    };
    card.rows.push(d);
    if (mates.length && card.people.length === 0) {
      const all = [d.rule, ...mates];
      card.people = w.members.filter((m) => all.some((r) => r.owner_id === m.id)).map((m) => m.id);
      card.donePeople = all.filter((r) => {
        const due = dueFor(w, r)?.due;
        return !due || due.status === 'done' || (!!due.dueOn && !!d.due.dueOn && due.dueOn > d.due.dueOn);
      }).map((r) => r.owner_id);
    }
    cards.set(key, card);
  }
  return [...cards.values()];
}

// ---------------------------------------------------------------------------
// The Log: things whose history is kept (as opposed to Done-style chores)
// ---------------------------------------------------------------------------

/** A one-tap "Done", rather than a logged entry. Done taps show on Today and in the Feed, not in the Log. */
export function isDoneTap(w: World, e: EventRow): boolean {
  const data = (e.data ?? {}) as Record<string, unknown>;
  if (data.quick === true) return true;
  const rule = e.rule_id ? w.rules.find((r) => r.id === e.rule_id) : undefined;
  return !!rule && rule.completion === 'done' && !rule.logs_to;
}

/** Whether a thing belongs in the Log: anything that keeps a history, not Done-style chores. */
export function inLog(w: World, o: ObjectRow): boolean {
  const type = typeOf(w, o)?.name;
  if (isActivity(type)) return o.keep_log;
  const rules = w.rules.filter((r) => r.object_id === o.id && r.kind !== 'record');
  // A chore that logs to another item lives in that item's history, not as its own entry.
  if (isChore(type)) return rules.some((r) => r.completion === 'log' && !r.logs_to);
  return rules.length === 0 || rules.some((r) => r.completion === 'log');
}

/** An item's entries, including those a chore wrote here or a chore of this item wrote elsewhere. */
export function historyOf(w: World, o: ObjectRow, { logOnly = false } = {}): EventRow[] {
  const own = new Set(w.rules.filter((r) => r.object_id === o.id).map((r) => r.id));
  return w.events.filter((e) => (e.object_id === o.id || (e.rule_id != null && own.has(e.rule_id)))
    && !(logOnly && isDoneTap(w, e)));
}

/** Items a chore's entries can be logged on: anything that keeps a history (one animal or a whole group). */
export function logTargets(w: World): { id: string; name: string; kind: string; group: boolean; partOf: string | null }[] {
  return w.objects
    .filter((o) => !o.archived_at && !isChore(typeOf(w, o)?.name) && (!isActivity(typeOf(w, o)?.name) || o.keep_log))
    .map((o) => ({ id: o.id, name: o.name, kind: typeOf(w, o)?.name ?? '', group: o.is_group,
      partOf: o.parent_id ? (w.objects.find((g) => g.id === o.parent_id)?.name ?? null) : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
