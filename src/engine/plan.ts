// Who needs to know what, and when. Pure functions over the family's data, shared by the
// app's screens, the reminder sender (a Supabase Edge Function) and the calendar feed,
// so all three always agree.

import { addDays, daysBetween, isoWeekday, toMinutes, todayIn } from './dates';
import { computeDue, shouldNotifyToday, type DueResult, type EventRecord, type Rule } from './due';

// The shapes of the database rows this needs (a subset of the columns).
export interface PMember { id: string; display_name: string; role: 'parent' | 'member' | 'junior' | 'child' }
export interface PObject { id: string; name: string; owner_id: string; object_type_id: string; archived_at: string | null; created_by: string | null }
export interface PType { id: string; name: string; assignable: boolean }
export interface PRule {
  id: string; object_id: string; name: string; kind: Rule['kind']; event_kind: string | null; every_months: number | null;
  every_days: number | null; meter_every: number | null; meter_unit: string | null; due_on: string | null;
  renew_every_months: number | null; starts_on: string | null; meter_start: number | null; weekdays: number[] | null;
  owner_id: string; lead_days: number[]; overdue_repeat_days: number; active: boolean; created_at: string;
}
export interface PEvent {
  id: string; object_id: string; kind: string; occurred_on: string; meter_value: number | null; meter_unit: string | null;
  data: unknown; created_by: string | null; created_at: string; rule_id: string | null;
}
export interface PSlot {
  id: string; object_id: string; weekdays: number[]; starts_at: string | null; ends_at: string | null;
  drop_off_by: string | null; pick_up_by: string | null; active: boolean;
  /** A one-off on this date (the dentist), or null for every week on its weekdays. */
  on_date?: string | null;
  /** Who goes; empty means the person it belongs to. */
  people?: string[];
}
export interface PChange { slot_id: string; on_date: string; cancelled: boolean; drop_off_by: string | null; pick_up_by: string | null; note: string | null }

export interface PlanData {
  members: PMember[];
  objects: PObject[];
  types: PType[];
  rules: PRule[]; // active only
  events: PEvent[]; // effective events
  slots: PSlot[]; // active only
  changes: PChange[];
}

const sameKind = (a: string | null, b: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export function toEngineRule(r: PRule): Rule {
  return {
    id: r.id, kind: r.kind, eventKind: r.event_kind, everyMonths: r.every_months, everyDays: r.every_days,
    meterEvery: r.meter_every, meterUnit: r.meter_unit, dueOn: r.due_on, renewEveryMonths: r.renew_every_months,
    // A weekly chore with no start date starts the day it was set up.
    startsOn: r.starts_on ?? (r.kind === 'weekly' ? todayIn('Europe/Prague', new Date(r.created_at)) : null),
    meterStart: r.meter_start, weekdays: r.weekdays, leadDays: r.lead_days, overdueRepeatDays: r.overdue_repeat_days,
  };
}

export const toEngineEvent = (e: PEvent): EventRecord => ({
  id: e.id, kind: e.kind, occurredOn: e.occurred_on, meterValue: e.meter_value, meterUnit: e.meter_unit,
  data: (e.data ?? {}) as Record<string, unknown>, createdAt: e.created_at,
});

/**
 * The entries that count for a reminder. An entry that names its reminder counts only for it.
 * When an item has turns (the same job reminding different people, like dishes), an entry
 * that names none counts for the turn of whoever logged it.
 */
export function eventsForRule<E extends PEvent>(rules: PRule[], events: E[], rule: PRule): E[] {
  const turns = rules.filter((r) => r.object_id === rule.object_id && r.kind !== 'record' && sameKind(r.event_kind, rule.event_kind));
  const hasTurns = new Set(turns.map((r) => r.owner_id)).size > 1;
  return events.filter((e) => e.object_id === rule.object_id
    && (e.rule_id ? e.rule_id === rule.id : !hasTurns || e.created_by === rule.owner_id));
}

export function dueOf(d: PlanData, rule: PRule, today: string): DueResult {
  return computeDue(toEngineRule(rule), eventsForRule(d.rules, d.events, rule).map(toEngineEvent), today);
}

/**
 * Who hears about a reminder: its person, except that a child without a phone (Benji)
 * has their reminders go to the parent who set the item up, or to both parents if nobody did.
 */
export function recipientsOf(d: PlanData, rule: PRule): string[] {
  const owner = d.members.find((m) => m.id === rule.owner_id);
  if (owner?.role !== 'child') return [rule.owner_id];
  const object = d.objects.find((o) => o.id === rule.object_id);
  const setter = d.members.find((m) => m.id === object?.created_by && m.role === 'parent');
  return setter ? [setter.id] : d.members.filter((m) => m.role === 'parent').map((m) => m.id);
}

export interface Session {
  slotId: string; objectId: string; date: string;
  /** HH:MM, or null when no time is set (it shows for the whole day). */
  startsAt: string | null; endsAt: string | null;
  dropOffBy: string | null; pickUpBy: string | null; cancelled: boolean; changed: boolean; note: string | null;
  /** Who's going. */
  people: string[];
}

/** Activities and work happening on a date, with that date's changes applied, earliest first. */
export function sessionsOn(d: PlanData, date: string, objectId?: string): Session[] {
  const day = isoWeekday(date);
  return d.slots
    .filter((s) => s.active && s.weekdays.includes(day) && (!s.on_date || s.on_date === date) && (!objectId || s.object_id === objectId))
    .flatMap((slot) => {
      const object = d.objects.find((o) => o.id === slot.object_id);
      if (!object || object.archived_at) return [];
      const c = d.changes.find((x) => x.slot_id === slot.id && x.on_date === date);
      return [{
        slotId: slot.id, objectId: object.id, date, startsAt: slot.starts_at?.slice(0, 5) ?? null, endsAt: slot.starts_at ? (slot.ends_at?.slice(0, 5) ?? null) : null,
        dropOffBy: c ? c.drop_off_by : slot.drop_off_by, pickUpBy: c ? c.pick_up_by : slot.pick_up_by,
        cancelled: c?.cancelled ?? false, changed: !!c, note: c?.note ?? null,
        people: slot.people?.length ? slot.people : [object.owner_id],
      }];
    })
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
}

// ---------------------------------------------------------------------------
// Phone notifications
// ---------------------------------------------------------------------------
export interface Notice {
  /** Stops the same notice going out twice (the sender runs every 15 minutes). */
  key: string;
  title: string;
  body: string;
  url: string;
}

export const SUMMARY_FROM = 7 * 60; // 07:00
export const SUMMARY_UNTIL = 11 * 60; // a summary that couldn't go out by 11:00 is skipped
export const LIFT_LEAD = 45; // minutes

const nameOf = (d: PlanData, id: string | null) => d.members.find((m) => m.id === id)?.display_name ?? 'someone';
const objectOf = (d: PlanData, id: string) => d.objects.find((o) => o.id === id);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Lucy", "Lucy and Benji", "the whole family"; leaves out `except` (the reader). */
export function namesOf(d: PlanData, ids: string[], except?: string, wholeFamily = true): string {
  if (wholeFamily && d.members.every((m) => ids.includes(m.id))) return 'the whole family';
  const names = ids.filter((id) => id !== except).map((id) => nameOf(d, id));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * The morning summary for one person: what's due today, overdue (on the usual reminder
 * days, not every morning), coming up on its lead days, and today's activities and lifts.
 * Null when there's nothing to say.
 */
export function morningSummary(d: PlanData, memberId: string, today: string): Notice | null {
  const today_: string[] = [];
  const overdue: string[] = [];
  const soon: string[] = [];

  for (const rule of d.rules) {
    const object = objectOf(d, rule.object_id);
    if (!object || object.archived_at || rule.kind === 'record' || !recipientsOf(d, rule).includes(memberId)) continue;
    const due = dueOf(d, rule, today);
    if (!due.dueOn || due.status === 'done') continue;
    const forKid = rule.owner_id !== memberId ? ` (${nameOf(d, rule.owner_id)})` : '';
    const label = `${object.name}${rule.name && !['Done', 'Do it', 'Due', 'Reminder'].includes(rule.name) ? `: ${rule.name}` : ''}${forKid}`;
    const days = daysBetween(today, due.dueOn);
    // A set-day chore is on today's list on its days, however many earlier ones were missed.
    if (rule.kind === 'weekly' && rule.weekdays?.includes(isoWeekday(today)) && days <= 0) today_.push(label);
    else if (days === 0) today_.push(label);
    else if (days < 0) { if (shouldNotifyToday(toEngineRule(rule), due, today)) overdue.push(`${label}, ${-days} ${plural(-days, 'day', 'days')} overdue`); }
    else if (shouldNotifyToday(toEngineRule(rule), due, today)) soon.push(`${label} ${days === 1 ? 'tomorrow' : `in ${days} days`}`);
  }

  const plans = sessionsOn(d, today).filter((s) => !s.cancelled).flatMap((s) => {
    const object = objectOf(d, s.objectId)!;
    const mine = s.people.includes(memberId);
    const lifts = [s.dropOffBy === memberId ? (s.startsAt ? `drop-off ${s.startsAt}` : 'drop-off') : null, s.pickUpBy === memberId && s.endsAt ? `pick-up ${s.endsAt}` : null,
      s.pickUpBy === memberId && !s.endsAt ? 'pick-up' : null].filter(Boolean);
    if (!mine && lifts.length === 0) return [];
    const others = namesOf(d, s.people, memberId);
    const who = others ? ` (${mine ? `with ${others}` : others})` : '';
    return [`${s.startsAt ? `${s.startsAt} ` : ''}${object.name}${who}${lifts.length ? `, you do ${lifts.join(' and ')}` : ''}`];
  });

  const lines = [...overdue, ...today_, ...plans, ...soon];
  if (lines.length === 0) return null;
  const title = today_.length + overdue.length > 0
    ? `Today: ${today_.length + overdue.length} ${plural(today_.length + overdue.length, 'thing', 'things')} to do`
    : plans.length ? 'Today’s plans' : 'Coming up';
  return { key: `summary:${today}`, title, body: lines.slice(0, 8).join('\n') + (lines.length > 8 ? `\n…and ${lines.length - 8} more` : ''), url: '/' };
}

/** Lift heads-ups due by `minutes` past midnight: from 45 minutes before a drop-off or pick-up until it happens. */
export function liftNotices(d: PlanData, memberId: string, today: string, minutes: number): Notice[] {
  const out: Notice[] = [];
  for (const s of sessionsOn(d, today)) {
    if (s.cancelled) continue;
    const object = objectOf(d, s.objectId)!;
    const kid = namesOf(d, s.people, memberId, false) || 'yourself';
    const legs: [string | null, string | null, 'drop' | 'pick'][] = [[s.dropOffBy, s.startsAt, 'drop'], [s.pickUpBy, s.endsAt, 'pick']];
    for (const [driver, at, leg] of legs) {
      if (driver !== memberId || !at) continue;
      const t = toMinutes(at);
      if (minutes < t - LIFT_LEAD || minutes >= t) continue;
      out.push({
        key: `lift:${s.slotId}:${today}:${leg}`,
        title: leg === 'drop' ? `Drop ${kid} at ${object.name} by ${at}` : `Pick up ${kid} from ${object.name} at ${at}`,
        body: s.note ?? (leg === 'drop' ? `${object.name} starts at ${at}.` : `${object.name} finishes at ${at}.`),
        url: `/things/${object.id}`,
      });
    }
  }
  return out;
}

/** Everything one person should get right now, before removing what was already sent. */
export function noticesFor(d: PlanData, memberId: string, now: { date: string; minutes: number }): Notice[] {
  const out: Notice[] = [];
  if (now.minutes >= SUMMARY_FROM && now.minutes < SUMMARY_UNTIL) {
    const summary = morningSummary(d, memberId, now.date);
    if (summary) out.push(summary);
  }
  return [...out, ...liftNotices(d, memberId, now.date, now.minutes)];
}

// ---------------------------------------------------------------------------
// Calendar feed
// ---------------------------------------------------------------------------
export interface CalendarEntry {
  uid: string;
  title: string;
  description?: string;
  /** All-day entry on this date… */
  date?: string;
  /** …or a timed one, local Prague wall-clock times. */
  start?: { date: string; time: string };
  end?: { date: string; time: string };
  url: string;
}

export const CALENDAR_DAYS = 56; // eight weeks ahead

/** One person's calendar: what they need to do (next due dates; set-day chores for 8 weeks) and activities they go to or drive. */
export function calendarFor(d: PlanData, memberId: string, today: string): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const horizon = addDays(today, CALENDAR_DAYS);

  for (const rule of d.rules) {
    const object = objectOf(d, rule.object_id);
    if (!object || object.archived_at || rule.kind === 'record' || !recipientsOf(d, rule).includes(memberId)) continue;
    const forKid = rule.owner_id !== memberId ? ` (${nameOf(d, rule.owner_id)})` : '';
    const title = `${object.name}${rule.name && !['Done', 'Do it', 'Due', 'Reminder'].includes(rule.name) ? `: ${rule.name}` : ''}${forKid}`;
    const url = `/things/${object.id}`;
    const due = dueOf(d, rule, today);
    if (rule.kind === 'weekly' && rule.weekdays?.length) {
      // Every set day for eight weeks, from today (or the next one not done yet).
      const from = due.dueOn && due.dueOn > today ? due.dueOn : today;
      for (let day = from; day <= horizon; day = addDays(day, 1)) {
        if (rule.weekdays.includes(isoWeekday(day))) {
          out.push({ uid: `rule-${rule.id}-${day}`, title, date: day, description: due.basis, url });
        }
      }
    } else if (due.dueOn && due.status !== 'done') {
      out.push({ uid: `rule-${rule.id}`, title, date: due.dueOn < today ? today : due.dueOn,
        description: due.dueOn < today ? `Overdue since ${due.dueOn}. ${due.basis}` : due.basis, url });
    }
  }

  for (let day = addDays(today, -7); day <= horizon; day = addDays(day, 1)) {
    for (const s of sessionsOn(d, day)) {
      const object = objectOf(d, s.objectId)!;
      const mine = s.people.includes(memberId);
      const drives = [s.dropOffBy === memberId ? 'drop-off' : null, s.pickUpBy === memberId ? 'pick-up' : null].filter(Boolean);
      if (s.cancelled || (!mine && drives.length === 0)) continue;
      const others = namesOf(d, s.people, memberId);
      const who = others ? ` (${mine ? `with ${others}` : others})` : '';
      const driving = [s.dropOffBy ? `Drop-off: ${nameOf(d, s.dropOffBy)}` : null, s.pickUpBy ? `Pick-up: ${nameOf(d, s.pickUpBy)}` : null].filter(Boolean).join('. ');
      out.push({
        uid: `slot-${s.slotId}-${day}`,
        title: `${object.name}${who}${drives.length && !mine ? `: you do ${drives.join(' and ')}` : ''}`,
        ...(s.startsAt
          ? { start: { date: day, time: s.startsAt },
              end: { date: day, time: s.endsAt ?? `${String(Math.min(23, Number(s.startsAt.slice(0, 2)) + 1)).padStart(2, '0')}:${s.startsAt.slice(3)}` } }
          : { date: day }),
        description: [driving, s.note].filter(Boolean).join('. ') || undefined,
        url: `/things/${object.id}`,
      });
    }
  }
  return out;
}
