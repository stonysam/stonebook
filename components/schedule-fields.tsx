'use client';

import { useState } from 'react';
import type { MemberRow } from '@/lib/database.types';
import { WEEKDAYS } from '@/lib/format';
import { isChore, typeUi } from '@/lib/types';
import { addDays, isoWeekday } from '@/src/engine/dates';

type How = 'none' | 'daily' | 'weekly' | 'interval' | 'meter' | 'date' | 'record';

/**
 * Reminder inputs, posted with the surrounding form (how, what, responsible, days, day_owner_N, every_n …).
 * In the Add form, things that fall due by nature (bills, documents, chores) ask up front;
 * for the rest (a car, a flock) a reminder is optional and starts folded away.
 */
export function ScheduleFields({ typeName, members, owner, meId, today, inAddForm = false }: {
  typeName: string; members: MemberRow[]; owner: string; meId: string; today: string; inAddForm?: boolean;
}) {
  const chore = isChore(typeName);
  const ui = typeUi(typeName);
  const hasMeter = typeName === 'Vehicle' || typeName === 'Machine';
  const options: [How, string][] = chore
    ? [['weekly', 'On set days'], ['daily', 'Every day'], ['interval', 'Every few weeks'], ['date', 'Just once']]
    : [
        ['interval', 'Every few months'],
        ...(hasMeter ? [['meter', 'By km or hours'] as [How, string]] : []),
        ['date', 'On a date'],
        ['weekly', 'On set days'],
        ['record', 'Just keep history'],
      ];
  const optional = inAddForm && !ui.dueQuestion;
  if (inAddForm && !optional && !chore) options.push(['none', 'No reminder']);

  const [open, setOpen] = useState(!optional);
  const [how, setHow] = useState<How>(chore ? 'weekly' : typeName === 'Document' || typeName === 'Bill' || typeName === 'Subscription' ? 'date' : options[0][0]);
  const [days, setDays] = useState<number[]>([]);
  const [responsible, setResponsible] = useState<string | null>(null); // null: whoever looks after it
  const [turns, setTurns] = useState(false);
  const [dayOwner, setDayOwner] = useState<Record<number, string>>({});
  const [by, setBy] = useState<'today' | 'tomorrow' | 'week' | 'pick'>('week');
  const [picked, setPicked] = useState(addDays(today, 7));

  const who = responsible ?? owner;
  const name = (id: string) => (id === meId ? 'Me' : members.find((m) => m.id === id)?.display_name ?? '');
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const sunday = addDays(today, (7 - isoWeekday(today)) % 7);
  const dueOn = by === 'today' ? today : by === 'tomorrow' ? addDays(today, 1) : by === 'week' ? sunday : picked;

  if (!open) {
    return (
      <div className="stack">
        <input type="hidden" name="how" value="none" />
        <button type="button" className="btn dashed" style={{ justifyContent: 'flex-start' }} onClick={() => setOpen(true)}>
          + Add a reminder (optional)
        </button>
        <span className="small">For something done regularly, like {hasMeter ? 'a service or tyre change' : 'a check or a filter change'}. You can also add reminders later.</span>
      </div>
    );
  }

  const summary = turns
    ? days.map((d) => `${WEEKDAYS[d - 1][2].slice(0, 3)} ${name(dayOwner[d] ?? who)}`).join(', ')
    : WEEKDAYS.filter(([n]) => days.includes(n)).map(([, , full]) => full).join(' and ');

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
      <div className="row">
        <legend className="small" style={{ marginBottom: 8 }}>{optional ? 'Reminder' : (ui.dueQuestion ?? 'How often?')}</legend>
        <span className="spacer" />
        {optional && <button type="button" className="btn btn-text" style={{ minHeight: 32 }} onClick={() => setOpen(false)}>Remove</button>}
      </div>
      <input type="hidden" name="how" value={how} />
      <div className="wrap">
        {options.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={how === value} onClick={() => setHow(value)}>{label}</button>
        ))}
      </div>

      {how !== 'none' && how !== 'record' && !chore && (
        <label className="field">What gets done?
          <input name="what" maxLength={80} required
            placeholder={hasMeter ? 'e.g. Oil change, Tyres changed' : typeName === 'Bill' ? 'e.g. Paid' : typeName === 'Document' ? 'e.g. Renewed' : 'e.g. Filter changed, Renewed, Paid'} />
        </label>
      )}
      {chore && <input type="hidden" name="what" value="Done" />}

      {how === 'weekly' && (
        <div className="card stack" style={{ background: 'var(--surface-2)', border: 0 }}>
          <span>Which days?</span>
          <div className="days">
            {WEEKDAYS.map(([n, short, full]) => (
              <button key={n} type="button" className="day" aria-pressed={days.includes(n)} aria-label={full} onClick={() => toggleDay(n)}>{short}</button>
            ))}
          </div>
          {days.map((d) => <input key={d} type="hidden" name="days" value={d} />)}
          {chore && days.length > 1 && !turns && (
            <button type="button" className="btn btn-text" style={{ alignSelf: 'flex-start', minHeight: 36 }} onClick={() => setTurns(true)}>
              Different people on different days?
            </button>
          )}
          {turns && days.map((d) => (
            <label key={d} className="row" style={{ gap: 12 }}>
              <span style={{ flex: '0 0 104px' }}>{WEEKDAYS[d - 1][2]}</span>
              <select style={{ flex: '1 1 auto' }} name={`day_owner_${d}`} value={dayOwner[d] ?? who} onChange={(e) => setDayOwner({ ...dayOwner, [d]: e.target.value })}>
                {members.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
              </select>
            </label>
          ))}
          <span className="small">{days.length ? `${turns ? 'Turns: ' : 'Every '}${summary}.` : 'Tap the days, e.g. Tuesday and Friday.'}</span>
        </div>
      )}

      {how === 'interval' && (
        <div className="row">
          <label className="field" style={{ flex: '0 0 96px' }}>Every
            <input name="every_n" inputMode="numeric" defaultValue={chore ? 2 : 6} required />
          </label>
          <label className="field" style={{ flex: '1 1 auto' }}>&nbsp;
            <select name="every_unit" defaultValue={chore ? 'weeks' : 'months'}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </label>
        </div>
      )}
      {how === 'interval' && !chore && (
        <label className="field">Last done (optional, so the first reminder is right)
          <input type="date" name="last_done" max={today} />
        </label>
      )}

      {how === 'meter' && (
        <>
          <div className="row">
            <label className="field" style={{ flex: '0 0 120px' }}>Every
              <input name="meter_every" inputMode="numeric" placeholder="15000" required />
            </label>
            <label className="field" style={{ flex: '1 1 auto' }}>&nbsp;
              <select name="meter_unit" defaultValue={typeName === 'Machine' ? 'hours' : 'km'}>
                <option value="km">km</option>
                <option value="hours">engine hours</option>
              </select>
            </label>
          </div>
          <label className="field">…or every this many months, whichever comes first (optional)
            <input name="meter_months" inputMode="numeric" placeholder="12" />
          </label>
          <label className="field">Reading when it was last done (optional)
            <input name="meter_start" inputMode="numeric" placeholder="e.g. 182400" />
          </label>
        </>
      )}

      {how === 'date' && chore && (
        <div className="stack">
          <span className="small">Done by when?</span>
          <div className="wrap">
            {([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['pick', 'Pick a date']] as const).map(([v, l]) => (
              <button key={v} type="button" className="chip" aria-pressed={by === v} onClick={() => setBy(v)}>{l}</button>
            ))}
          </div>
          {by === 'pick' && <label className="field">Date<input type="date" value={picked} min={today} onChange={(e) => setPicked(e.target.value)} required /></label>}
          <input type="hidden" name="due_on" value={dueOn} />
        </div>
      )}
      {how === 'date' && !chore && (
        <>
          <label className="field">{typeName === 'Document' ? 'Expiry date' : typeName === 'Subscription' ? 'Next renewal' : 'Date'}
            <input type="date" name="due_on" required />
          </label>
          <label className="field">Repeats every … months (optional)
            <input name="renew_months" inputMode="numeric" placeholder={typeName === 'Document' ? 'Leave empty; log the new date when renewed' : 'e.g. 1 for a monthly bill, 12 for yearly'} />
          </label>
        </>
      )}

      {how !== 'none' && how !== 'record' && !(how === 'weekly' && turns) && !(chore && inAddForm) && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>{chore ? 'Who does it?' : 'Who gets reminded?'}</legend>
          <div className="wrap">
            {members.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={who === m.id} onClick={() => setResponsible(m.id)}>{name(m.id)}</button>
            ))}
          </div>
          {!chore && who !== owner && <span className="small">{name(who)} gets this reminder; the item stays with {name(owner)}.</span>}
        </fieldset>
      )}
      <input type="hidden" name="responsible" value={who} />
    </fieldset>
  );
}
