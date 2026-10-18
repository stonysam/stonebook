import { describe, expect, it } from 'vitest';
import { addMonths, isoWeekday, todayIn } from '../src/engine/dates';
import { computeDue, effectiveEvents, shouldNotifyToday, type EventRecord, type Rule } from '../src/engine/due';

const ev = (id: string, kind: string, occurredOn: string, extra: Partial<EventRecord> = {}): EventRecord =>
  ({ id, kind, occurredOn, ...extra });

describe('dates', () => {
  it('clamps month ends and does not drift', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('reads today on the Prague calendar, not the server clock', () => {
    // 23:30 UTC on 18 Oct is already 19 Oct in Prague (UTC+2)
    expect(todayIn('Europe/Prague', new Date('2026-10-18T23:30:00Z'))).toBe('2026-10-19');
  });
});

describe('corrections (append-only ledger)', () => {
  it('a correction replaces the original; a void cancels it', () => {
    const events = [
      ev('a', 'oil change', '2026-03-14'),
      ev('b', 'oil change', '2026-03-15', { correctionOf: 'a' }),
      ev('c', 'oil change', '2026-06-01'),
      ev('d', 'oil change', '2026-06-01', { correctionOf: 'c', voided: true }),
    ];
    expect(effectiveEvents(events).map((e) => e.id)).toEqual(['b']);
  });

  it('due dates follow the corrected entry', () => {
    const rule: Rule = { id: 'r', kind: 'interval', eventKind: 'filter change', everyMonths: 6 };
    const events = [
      ev('a', 'filter change', '2026-01-10'),
      ev('b', 'filter change', '2026-02-10', { correctionOf: 'a' }),
    ];
    expect(computeDue(rule, events, '2026-05-01').dueOn).toBe('2026-08-10');
  });
});

describe('interval rules', () => {
  const filter: Rule = { id: 'water-filter', kind: 'interval', eventKind: 'Filter change', everyMonths: 6 };

  it('counts from the last matching event, case-insensitive', () => {
    const due = computeDue(filter, [ev('1', 'filter change', '2026-05-02')], '2026-10-18');
    expect(due.dueOn).toBe('2026-11-02');
    expect(due.status).toBe('ok'); // 15 days away, outside the 14-day lead window
  });

  it('status bands: ok, due soon, overdue', () => {
    const at = (today: string) => computeDue(filter, [ev('1', 'filter change', '2026-05-02')], today).status;
    expect(at('2026-10-01')).toBe('ok');
    expect(at('2026-10-19')).toBe('due_soon'); // 14 days before
    expect(at('2026-11-02')).toBe('due_soon'); // due today
    expect(at('2026-11-03')).toBe('overdue');
  });

  it('never done without a log or a starting date', () => {
    expect(computeDue(filter, [], '2026-10-18').status).toBe('never_done');
    expect(computeDue({ ...filter, startsOn: '2026-09-01' }, [], '2026-10-18').dueOn).toBe('2027-03-01');
  });

  it('ignores events of other kinds', () => {
    const due = computeDue(filter, [ev('1', 'septic check', '2026-10-01'), ev('2', 'filter change', '2026-01-01')], '2026-03-01');
    expect(due.dueOn).toBe('2026-07-01');
  });
});

describe('usage (meter) rules', () => {
  const tractor: Rule = { id: 'tractor', kind: 'meter', eventKind: 'service', meterEvery: 250, meterUnit: 'hours' };

  it('due at last service reading + interval, with a date estimated from usage', () => {
    const events = [
      ev('s', 'service', '2026-04-01', { meterValue: 1200, meterUnit: 'hours' }),
      ev('r1', 'reading', '2026-07-01', { meterValue: 1290, meterUnit: 'hours' }),
      ev('r2', 'reading', '2026-10-01', { meterValue: 1380, meterUnit: 'hours' }),
    ];
    const due = computeDue(tractor, events, '2026-10-18');
    expect(due.meter?.dueAt).toBe(1450);
    expect(due.meter?.remaining).toBe(70);
    // 180 h over 183 days since the service reading -> ~0.98 h/day -> 70 h ≈ 72 days
    expect(due.meter?.estimatedDueOn).toBe('2026-12-12');
    expect(due.status).toBe('ok');
  });

  it('overdue once the reading passes the threshold', () => {
    const events = [
      ev('s', 'service', '2026-01-01', { meterValue: 1000, meterUnit: 'hours' }),
      ev('r', 'reading', '2026-10-01', { meterValue: 1260, meterUnit: 'hours' }),
    ];
    expect(computeDue(tractor, events, '2026-10-18').status).toBe('overdue');
  });

  it('due soon when under 10% of the interval remains, even without a date', () => {
    const events = [ev('s', 'service', '2026-10-10', { meterValue: 1000, meterUnit: 'hours' }),
                    ev('r', 'reading', '2026-10-15', { meterValue: 1230, meterUnit: 'hours' })];
    const due = computeDue(tractor, events, '2026-10-18');
    expect(due.meter?.estimatedDueOn).toBeNull(); // readings span < 14 days
    expect(due.status).toBe('due_soon');
  });

  it('uses the meter baseline when no service is logged', () => {
    const due = computeDue({ ...tractor, meterStart: 800 }, [], '2026-10-18');
    expect(due.meter?.dueAt).toBe(1050);
  });

  it('whichever comes first: 12 months or 15,000 km', () => {
    const car: Rule = { id: 'car', kind: 'interval', eventKind: 'oil change', everyMonths: 12, meterEvery: 15000, meterUnit: 'km' };
    const events = [
      ev('s', 'oil change', '2026-01-10', { meterValue: 180000, meterUnit: 'km' }),
      ev('r', 'reading', '2026-07-10', { meterValue: 190000, meterUnit: 'km' }),
    ];
    const due = computeDue(car, events, '2026-07-20');
    // 10,000 km in 181 days -> 5,000 km left ≈ 91 days -> early October, before the 12-month date
    expect(due.dueOn).toBe(due.meter?.estimatedDueOn);
    expect(due.dueOn! < '2027-01-10').toBe(true);
  });
});

describe('fixed-date rules', () => {
  it('passport: due on expiry, reset by a renewal with a new date', () => {
    const passport: Rule = { id: 'pp', kind: 'fixed_date', eventKind: 'renewed', dueOn: '2027-03-01', leadDays: [180, 60, 14] };
    expect(computeDue(passport, [], '2026-10-18').status).toBe('due_soon'); // within 180 days
    const renewed = computeDue(passport, [ev('1', 'renewed', '2027-01-20', { data: { next_due: '2037-01-20' } })], '2027-02-01');
    expect(renewed.dueOn).toBe('2037-01-20');
    expect(renewed.status).toBe('ok');
  });

  it('one-off item done when completed near its date', () => {
    const insurance: Rule = { id: 'ins', kind: 'fixed_date', eventKind: 'renewed', dueOn: '2026-11-01' };
    expect(computeDue(insurance, [ev('1', 'renewed', '2026-10-25')], '2026-10-26').status).toBe('done');
  });

  it('monthly bill on the 15th: paying early covers that month', () => {
    const bill: Rule = { id: 'elec', kind: 'fixed_date', eventKind: 'paid', dueOn: '2026-09-15', renewEveryMonths: 1 };
    expect(computeDue(bill, [], '2026-09-01').dueOn).toBe('2026-09-15');
    const events = [ev('1', 'paid', '2026-09-12'), ev('2', 'paid', '2026-10-10')];
    expect(computeDue(bill, events, '2026-10-18').dueOn).toBe('2026-11-15');
  });

  it('a missed month shows as overdue', () => {
    const bill: Rule = { id: 'elec', kind: 'fixed_date', eventKind: 'paid', dueOn: '2026-09-15', renewEveryMonths: 1 };
    const due = computeDue(bill, [ev('1', 'paid', '2026-09-12')], '2026-10-18');
    expect(due.dueOn).toBe('2026-10-15');
    expect(due.status).toBe('overdue');
  });

  it('marking a specific due item done uses data.covers exactly', () => {
    const bill: Rule = { id: 'tv', kind: 'fixed_date', eventKind: 'paid', dueOn: '2026-01-31', renewEveryMonths: 1 };
    const due = computeDue(bill, [ev('1', 'paid', '2026-03-20', { data: { covers: '2026-02-28' } })], '2026-03-20');
    expect(due.dueOn).toBe('2026-03-31');
  });

  it('yearly subscription', () => {
    const sub: Rule = { id: 'sub', kind: 'fixed_date', eventKind: 'renewed', dueOn: '2026-12-01', renewEveryMonths: 12 };
    expect(computeDue(sub, [ev('1', 'renewed', '2026-11-28')], '2026-11-29').dueOn).toBe('2027-12-01');
  });
});

describe('record-only rules', () => {
  it('never fall due', () => {
    const heating: Rule = { id: 'h', kind: 'record', eventKind: null };
    expect(computeDue(heating, [ev('1', 'heating started', '2026-10-05')], '2026-10-18').status).toBe('record');
  });
});

describe('reminders', () => {
  const rule: Rule = { id: 'r', kind: 'fixed_date', eventKind: 'paid', dueOn: '2026-11-15' };
  const at = (today: string) => shouldNotifyToday(rule, computeDue(rule, [], today), today);

  it('14 days and 1 day before, then weekly while overdue', () => {
    expect(at('2026-11-01')).toBe(true);   // 14 days before
    expect(at('2026-11-02')).toBe(false);
    expect(at('2026-11-14')).toBe(true);   // 1 day before
    expect(at('2026-11-15')).toBe(false);  // due day: no extra ping by default
    expect(at('2026-11-16')).toBe(true);   // first day overdue
    expect(at('2026-11-17')).toBe(false);
    expect(at('2026-11-23')).toBe(true);   // a week later
  });
});

describe('weekly rules on set days', () => {
  const hens: Rule = { id: 'hens', kind: 'weekly', eventKind: 'Done', weekdays: [5, 2] };

  it('knows the weekday (18 Oct 2026 is a Sunday)', () => {
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(isoWeekday('2026-10-19')).toBe(1);
  });

  it('a new chore starts on the next set day', () => {
    const due = computeDue(hens, [], '2026-10-18');
    expect(due.dueOn).toBe('2026-10-20');
    expect(due.status).toBe('ok');
    expect(due.basis).toBe('Every Tue and Fri.');
  });

  it('after Tuesday is done, Friday is next: due on the day, overdue after', () => {
    const events = [ev('1', 'done', '2026-10-20')];
    expect(computeDue(hens, events, '2026-10-21').dueOn).toBe('2026-10-23');
    expect(computeDue(hens, events, '2026-10-23').status).toBe('due_soon');
    expect(computeDue(hens, events, '2026-10-24').status).toBe('overdue');
  });

  it('a late completion covers the missed day, not the next one', () => {
    const events = [ev('1', 'done', '2026-10-16'), ev('2', 'done', '2026-10-21')];
    expect(computeDue(hens, [events[0]], '2026-10-21').status).toBe('overdue'); // Tuesday missed
    expect(computeDue(hens, events, '2026-10-21').dueOn).toBe('2026-10-23');
  });

  it('reminds on the day and once the day after', () => {
    const events = [ev('1', 'done', '2026-10-20')];
    const at = (today: string) => shouldNotifyToday(hens, computeDue(hens, events, today), today);
    expect(at('2026-10-22')).toBe(false);
    expect(at('2026-10-23')).toBe(true);
    expect(at('2026-10-24')).toBe(true);
    expect(at('2026-10-25')).toBe(false);
  });
});
