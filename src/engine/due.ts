// The due-date engine. Pure functions: events + rule + today -> what's due.
//
// The event log is the source of truth (like a ledger). Nothing here is stored;
// it is recomputed whenever it's needed, so a corrected event automatically
// corrects every due date that depended on it.

import { addDays, addMonths, daysBetween, isoWeekday, minDate, parseDate } from './dates';

export type RuleKind = 'interval' | 'meter' | 'fixed_date' | 'weekly' | 'record';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface EventRecord {
  id: string;
  kind: string;
  occurredOn: string;
  meterValue?: number | null;
  meterUnit?: string | null;
  data?: Record<string, unknown>;
  correctionOf?: string | null;
  voided?: boolean;
  createdAt?: string;
}

export interface Rule {
  id: string;
  kind: RuleKind;
  eventKind: string | null;
  everyMonths?: number | null;
  everyDays?: number | null;
  meterEvery?: number | null;
  meterUnit?: string | null;
  dueOn?: string | null;
  renewEveryMonths?: number | null;
  startsOn?: string | null;
  meterStart?: number | null;
  /** weekly: ISO weekdays it falls on, 1 = Monday … 7 = Sunday */
  weekdays?: number[] | null;
  leadDays?: number[];
  overdueRepeatDays?: number;
}

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'never_done' | 'done' | 'record';

export interface MeterState {
  unit: string;
  dueAt: number;
  current: number | null;
  currentOn: string | null;
  remaining: number | null;
  estimatedDueOn: string | null;
}

export interface DueResult {
  ruleId: string;
  status: DueStatus;
  dueOn: string | null;
  daysUntilDue: number | null;
  meter: MeterState | null;
  /** Plain-language reason, shown in the app so people can trust the date. */
  basis: string;
}

const DEFAULT_LEAD = [14, 1];
/** A usage rule counts as "due soon" once less than this share of the interval remains. */
const METER_SOON_SHARE = 0.1;
/** Readings must span at least this many days before we estimate a date from usage. */
const MIN_RATE_SPAN_DAYS = 14;

const sameText = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const byDate = (a: EventRecord, b: EventRecord) =>
  a.occurredOn === b.occurredOn
    ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    : a.occurredOn.localeCompare(b.occurredOn);

/**
 * Applies corrections: an event replaced by a correction drops out; a voiding
 * correction cancels the original and itself. Chains of corrections work the
 * same way (only the latest in the chain survives).
 */
export function effectiveEvents(events: EventRecord[]): EventRecord[] {
  const corrected = new Set(events.filter((e) => e.correctionOf).map((e) => e.correctionOf as string));
  return events.filter((e) => !e.voided && !corrected.has(e.id)).sort(byDate);
}

function leadWindow(rule: Rule): number {
  const lead = rule.leadDays?.length ? rule.leadDays : DEFAULT_LEAD;
  return Math.max(...lead);
}

function statusFromDate(dueOn: string, today: string, rule: Rule): DueStatus {
  const days = daysBetween(today, dueOn);
  if (days < 0) return 'overdue';
  if (days <= leadWindow(rule)) return 'due_soon';
  return 'ok';
}

function result(rule: Rule, status: DueStatus, dueOn: string | null, today: string, basis: string, meter: MeterState | null = null): DueResult {
  return {
    ruleId: rule.id,
    status,
    dueOn,
    daysUntilDue: dueOn ? daysBetween(today, dueOn) : null,
    meter,
    basis,
  };
}

export function computeDue(rule: Rule, events: EventRecord[], today: string): DueResult {
  parseDate(today);
  const effective = effectiveEvents(events);

  switch (rule.kind) {
    case 'record':
      return result(rule, 'record', null, today, 'Keeps history only; nothing falls due.');
    case 'fixed_date':
      return computeFixedDate(rule, effective, today);
    case 'weekly':
      return computeWeekly(rule, effective, today);
    case 'interval':
    case 'meter':
      return computeInterval(rule, effective, today);
  }
}

// ---------------------------------------------------------------------------
// Interval (time and/or usage, whichever comes first)
// ---------------------------------------------------------------------------
function computeInterval(rule: Rule, effective: EventRecord[], today: string): DueResult {
  const matches = effective.filter((e) => sameText(e.kind, rule.eventKind));
  const last = matches.at(-1) ?? null;
  const hasTime = !!(rule.everyMonths || rule.everyDays);
  const hasMeter = !!(rule.meterEvery && rule.meterUnit);
  const reasons: string[] = [];

  // Time part
  let timeDue: string | null = null;
  const timeBase = last?.occurredOn ?? rule.startsOn ?? null;
  if (hasTime && timeBase) {
    timeDue = addDays(addMonths(timeBase, rule.everyMonths ?? 0), rule.everyDays ?? 0);
    const every = [rule.everyMonths ? `${rule.everyMonths} month${rule.everyMonths > 1 ? 's' : ''}` : null,
                   rule.everyDays ? `${rule.everyDays} day${rule.everyDays > 1 ? 's' : ''}` : null]
      .filter(Boolean).join(' ');
    reasons.push(last
      ? `Last "${rule.eventKind}" on ${last.occurredOn}; repeats every ${every}.`
      : `Nothing logged yet; counting from ${timeBase}, every ${every}.`);
  }

  // Usage part
  let meter: MeterState | null = null;
  if (hasMeter) {
    meter = computeMeter(rule, effective, last);
    if (meter) {
      const fmt = (n: number) => n.toLocaleString('en-GB');
      reasons.push(meter.current !== null
        ? `Due at ${fmt(meter.dueAt)} ${meter.unit}; latest reading ${fmt(meter.current)} ${meter.unit} on ${meter.currentOn}.`
        : `Due at ${fmt(meter.dueAt)} ${meter.unit}; no readings logged yet.`);
      if (meter.estimatedDueOn) reasons.push(`At recent usage that's around ${meter.estimatedDueOn}.`);
    }
  }

  if (!timeDue && !meter) {
    return result(rule, 'never_done', null, today,
      `No "${rule.eventKind}" logged yet. Log the last one, or set a starting date or reading.`);
  }

  const dueOn = minDate(timeDue, meter?.estimatedDueOn);
  const meterOverdue = meter?.remaining != null && meter.remaining <= 0;
  const meterSoon = meter?.remaining != null && rule.meterEvery != null && meter.remaining <= rule.meterEvery * METER_SOON_SHARE;

  let status: DueStatus;
  if (meterOverdue) status = 'overdue';
  else if (dueOn) {
    status = statusFromDate(dueOn, today, rule);
    if (status === 'ok' && meterSoon) status = 'due_soon';
  } else status = meterSoon ? 'due_soon' : 'ok';

  return result(rule, status, dueOn, today, reasons.join(' '), meter);
}

function computeMeter(rule: Rule, effective: EventRecord[], lastService: EventRecord | null): MeterState | null {
  const unit = rule.meterUnit as string;
  const every = rule.meterEvery as number;
  const readings = effective.filter((e) => e.meterValue != null && sameText(e.meterUnit, unit));

  // Meter value at the last service: its own reading, else the latest reading on or before that day.
  let serviceValue: number | null = null;
  if (lastService) {
    if (lastService.meterValue != null && sameText(lastService.meterUnit, unit)) {
      serviceValue = lastService.meterValue;
    } else {
      const before = readings.filter((r) => r.occurredOn <= lastService.occurredOn).at(-1);
      serviceValue = before?.meterValue ?? null;
    }
  }
  if (serviceValue === null) serviceValue = rule.meterStart ?? null;
  if (serviceValue === null) return null;

  const dueAt = serviceValue + every;
  const latest = readings.at(-1) ?? null;
  const current = latest ? Math.max(latest.meterValue as number, serviceValue) : null;
  const currentOn = latest?.occurredOn ?? null;
  const remaining = current !== null ? dueAt - current : null;

  // Estimate a date from usage over the past year of readings.
  let estimatedDueOn: string | null = null;
  if (latest && remaining !== null && remaining > 0) {
    const windowStart = addDays(latest.occurredOn, -365);
    const recent = readings.filter((r) => r.occurredOn >= windowStart);
    const first = recent[0];
    const span = first ? daysBetween(first.occurredOn, latest.occurredOn) : 0;
    if (first && span >= MIN_RATE_SPAN_DAYS) {
      const perDay = ((latest.meterValue as number) - (first.meterValue as number)) / span;
      if (perDay > 0) estimatedDueOn = addDays(latest.occurredOn, Math.ceil(remaining / perDay));
    }
  }

  return { unit, dueAt, current, currentOn, remaining, estimatedDueOn };
}

// ---------------------------------------------------------------------------
// Fixed date (expiry, renewal, a bill due on the 15th every month)
// ---------------------------------------------------------------------------
function computeFixedDate(rule: Rule, effective: EventRecord[], today: string): DueResult {
  const window = leadWindow(rule);
  let anchor = rule.dueOn as string;
  let matches = effective.filter((e) => sameText(e.kind, rule.eventKind));

  // An event carrying data.next_due (e.g. "renewed passport, new expiry 2036-05-01") resets the anchor.
  const resetIdx = matches.findLastIndex((e) => typeof e.data?.next_due === 'string');
  if (resetIdx >= 0) {
    anchor = matches[resetIdx].data!.next_due as string;
    parseDate(anchor);
    matches = matches.slice(resetIdx + 1);
  }

  const period = rule.renewEveryMonths ?? null;

  if (!period) {
    // A one-off task counts as done by anything logged since it was set (startsOn), however early.
    const done = matches.find((e) => e.data?.covers === anchor || e.occurredOn >= addDays(anchor, -window)
      || (resetIdx < 0 && !!rule.startsOn && e.occurredOn >= rule.startsOn));
    if (done) {
      return result(rule, 'done', null, today,
        `Due ${anchor}; done on ${done.occurredOn}. Log a new due date to keep tracking.`);
    }
    return result(rule, statusFromDate(anchor, today, rule), anchor, today,
      resetIdx >= 0 ? `Due ${anchor} (date set at last renewal).` : `Due ${anchor}.`);
  }

  // Repeating schedule: occurrence k = anchor + k * period months.
  const occurrence = (k: number) => addMonths(anchor, k * period);
  const MAX_K = 1200;
  let maxCovered = -1;

  for (const e of matches) {
    let idx = -1;
    if (typeof e.data?.covers === 'string') {
      for (let k = 0; k < MAX_K && occurrence(k) <= (e.data.covers as string); k++) {
        if (occurrence(k) === e.data.covers) idx = k;
      }
    } else {
      // A completion counts for the latest occurrence on or before (event date + lead window),
      // so paying on the 10th covers the bill due on the 15th.
      const limit = addDays(e.occurredOn, window);
      for (let k = 0; k < MAX_K && occurrence(k) <= limit; k++) idx = k;
    }
    maxCovered = Math.max(maxCovered, idx);
  }

  const next = occurrence(maxCovered + 1);
  const basis = maxCovered >= 0
    ? `Repeats every ${period} month${period > 1 ? 's' : ''} from ${anchor}; ${occurrence(maxCovered)} is done.`
    : `Repeats every ${period} month${period > 1 ? 's' : ''} from ${anchor}.`;
  return result(rule, statusFromDate(next, today, rule), next, today, basis);
}

// ---------------------------------------------------------------------------
// Weekly on set days (feed the hens Tue and Fri)
// ---------------------------------------------------------------------------
/** Next day on or after `from` that falls on one of the weekdays. */
export function nextWeekday(from: string, weekdays: number[]): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (weekdays.includes(isoWeekday(d))) return d;
  }
  throw new Error('weekly rule needs at least one weekday');
}

function computeWeekly(rule: Rule, effective: EventRecord[], today: string): DueResult {
  const days = [...new Set(rule.weekdays ?? [])].filter((d) => d >= 1 && d <= 7).sort();
  const names = days.map((d) => DAY_NAMES[d - 1]).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const last = effective.filter((e) => sameText(e.kind, rule.eventKind)).at(-1) ?? null;

  // A completion covers the earliest open day, so doing Tuesday's job on Wednesday
  // still counts for Tuesday and the next one is Friday.
  const from = last ? addDays(last.occurredOn, 1) : (rule.startsOn ?? today);
  const dueOn = nextWeekday(from, days);
  const gap = daysBetween(today, dueOn);
  const status: DueStatus = gap < 0 ? 'overdue' : gap === 0 ? 'due_soon' : 'ok';
  const basis = last ? `Every ${names}. Last done ${last.occurredOn}.` : `Every ${names}.`;
  return result(rule, status, dueOn, today, basis);
}

// ---------------------------------------------------------------------------
// Reminders: should the owner be notified about this rule today?
// ---------------------------------------------------------------------------
export function shouldNotifyToday(rule: Rule, due: DueResult, today: string): boolean {
  if (!due.dueOn) return false; // usage-only rules without an estimate are notified on crossing (milestone 3)
  const days = daysBetween(today, due.dueOn);
  if (rule.kind === 'weekly') return days === 0 || days === -1; // on the day, and once the day after
  if (days >= 0) {
    const lead = rule.leadDays?.length ? rule.leadDays : DEFAULT_LEAD;
    return lead.includes(days);
  }
  const overdueBy = -days;
  const repeat = rule.overdueRepeatDays ?? 7;
  return overdueBy === 1 || (overdueBy - 1) % repeat === 0;
}
