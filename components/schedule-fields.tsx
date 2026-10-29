'use client';

import { useState } from 'react';
import type { MemberRow } from '@/lib/database.types';
import { WEEKDAYS } from '@/lib/format';
import { isChore, typeUi } from '@/lib/types';
import { addDays, isoWeekday } from '@/src/engine/dates';
import { ItemPicker, type PickableItem } from './item-picker';

type How = 'none' | 'daily' | 'weekly' | 'interval' | 'meter' | 'date' | 'record';

/**
 * Reminder inputs, posted with the surrounding form (how, what, responsible, days, day_owner_N, every_n …).
 * In the Add form, things that fall due by nature (bills, documents, chores) ask up front;
 * for the rest (a car, a flock) a reminder is optional and starts folded away.
 */
export function ScheduleFields({ typeName, members, owner, meId, today, inAddForm = false, onPeople, preselect = true, logTargets = [] }: {
  typeName: string; members: MemberRow[]; owner: string; meId: string; today: string; inAddForm?: boolean;
  /** Chores: tells the Add form who's doing it (a job for others or a group is always shared). */
  onPeople?: (ids: string[]) => void;
  /** Chores: start with `owner` ticked under "Who does it?" (false: nobody until someone is picked). */
  preselect?: boolean;
  /** Chores with "Log details": the items its entries can be recorded against. */
  logTargets?: PickableItem[];
}) {
  const chore = isChore(typeName);
  const ui = typeUi(typeName);
  const hasMeter = typeName === 'Vehicle' || typeName === 'Machine';
  const options: [How, string][] = chore
    ? [['date', 'Just once'], ['daily', 'Every day'], ['weekly', 'On set days'], ['interval', 'Regularly']]
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
  const [how, setHow] = useState<How>(chore ? 'date' : typeName === 'Document' || typeName === 'Bill' || typeName === 'Subscription' ? 'date' : options[0][0]);
  const [days, setDays] = useState<number[]>([]);
  const [responsible, setResponsible] = useState<string | null>(null); // null: whoever looks after it
  // Chores: who does it, picked once. Several people on something that repeats either do it
  // together each time (each ticks their own part) or take turns by day.
  const [people, setPeopleState] = useState<string[]>(preselect ? [owner] : []);
  const [together, setTogether] = useState(true);
  const [dayOwner, setDayOwner] = useState<Record<number, string>>({});
  const [by, setBy] = useState<'today' | 'tomorrow' | 'week' | 'month' | 'pick'>('week');
  const [picked, setPicked] = useState(addDays(today, 7));
  const [completion, setCompletion] = useState<'done' | 'log'>(chore ? 'done' : 'log');

  const who = responsible ?? owner;
  const setPeople = (ids: string[]) => { setPeopleState(ids); onPeople?.(ids); };
  const togglePerson = (id: string) => setPeople(people.includes(id) ? people.filter((x) => x !== id) : [...people, id]);
  const repeating = how === 'daily' || how === 'weekly';
  const turns = chore && repeating && people.length > 1 && !together;
  const turnDays = how === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : days;
  const ownerForDay = (d: number) => dayOwner[d] ?? people[turnDays.indexOf(d) % people.length] ?? people[0];
  const sentHow: How = turns && how === 'daily' ? 'weekly' : how;
  const name = (id: string) => (id === meId ? 'Me' : members.find((m) => m.id === id)?.display_name ?? '');
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const sunday = addDays(today, (7 - isoWeekday(today)) % 7);
  const [yy, mm] = today.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10); // last day of this calendar month
  const dueOn = by === 'today' ? today : by === 'tomorrow' ? addDays(today, 1) : by === 'week' ? sunday : by === 'month' ? monthEnd : picked;

  if (!open) {
    return (
      <div className="stack">
        <input type="hidden" name="how" value="none" />
        <button type="button" className="btn dashed" style={{ justifyContent: 'flex-start' }} onClick={() => setOpen(true)}>
          + Add a reminder (optional)
        </button>
        <span className="small">For something done regularly, like {hasMeter ? 'a service or tyre change' : typeName === 'Animal or flock' ? 'worming or a hoof trim' : 'a check or a filter change'}. You can also add reminders later.</span>
      </div>
    );
  }

  const summary = WEEKDAYS.filter(([n]) => days.includes(n)).map(([, , full]) => full).join(' and ');

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
      <div className="row">
        <legend className="small" style={{ marginBottom: 8 }}>{optional ? 'Reminder' : (ui.dueQuestion ?? 'How often?')}</legend>
        <span className="spacer" />
        {optional && <button type="button" className="btn btn-text" style={{ minHeight: 32 }} onClick={() => setOpen(false)}>Remove</button>}
      </div>
      <input type="hidden" name="how" value={sentHow} />
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
          <span className="small">{days.length ? `Every ${summary}.` : 'Tap the days, e.g. Tuesday and Friday.'}</span>
        </div>
      )}
      {(how === 'weekly' || turns) && turnDays.map((d) => <input key={d} type="hidden" name="days" value={d} />)}

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
            {([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'This month'], ['pick', 'Pick a date']] as const).map(([v, l]) => (
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

      {how !== 'none' && how !== 'record' && !chore && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>Who gets reminded?</legend>
          <div className="wrap">
            {members.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={who === m.id} onClick={() => setResponsible(m.id)}>{name(m.id)}</button>
            ))}
          </div>
          {who !== owner && <span className="small">{name(who)} gets this reminder; the item stays with {name(owner)}.</span>}
        </fieldset>
      )}
      {chore && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>Who does it?</legend>
          <div className="wrap">
            {members.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={people.includes(m.id)} onClick={() => togglePerson(m.id)}>{name(m.id)}</button>
            ))}
          </div>
          {people.length > 1 && repeating && (
            <div className="seg" role="radiogroup" aria-label="Several people" style={{ marginTop: 4 }}>
              <button type="button" role="radio" aria-checked={together} className={together ? 'on' : ''} onClick={() => setTogether(true)}>Together each time</button>
              <button type="button" role="radio" aria-checked={!together} className={!together ? 'on' : ''} onClick={() => setTogether(false)}>Take turns</button>
            </div>
          )}
          {people.length > 1 && (!repeating || together) && <span className="small">A group job: each of them ticks their own part, or taps Abort mission if they weren&apos;t part of it.</span>}
          {turns && (turnDays.length === 0
            ? <span className="small">Pick the days above first.</span>
            : (
              <div className="card stack" style={{ background: 'var(--surface-2)', border: 0, gap: 6 }}>
                <span className="small">Whose turn each day (change any):</span>
                {turnDays.map((d) => (
                  <label key={d} className="row" style={{ gap: 12 }}>
                    <span style={{ flex: '0 0 104px' }}>{WEEKDAYS[d - 1][2]}</span>
                    <select style={{ flex: '1 1 auto' }} name={`day_owner_${d}`} value={ownerForDay(d)} onChange={(e) => setDayOwner({ ...dayOwner, [d]: e.target.value })}>
                      {people.map((id) => <option key={id} value={id}>{name(id)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          {!turns && people.length > 1 && people.map((id) => <input key={id} type="hidden" name="people" value={id} />)}
          {inAddForm && people[0] && <input type="hidden" name="owner_id" value={people[0]} />}
          {people.length === 0 && <span className="small">Pick who does it.</span>}
        </fieldset>
      )}
      <input type="hidden" name="responsible" value={chore ? (people[0] ?? '') : who} />

      {how !== 'none' && how !== 'record' && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>When it&apos;s done</legend>
          <input type="hidden" name="completion" value={completion} />
          <div className="seg" role="radiogroup" aria-label="When it's done">
            <button type="button" role="radio" aria-checked={completion === 'done'} className={completion === 'done' ? 'on' : ''} onClick={() => setCompletion('done')}>Tap Done</button>
            <button type="button" role="radio" aria-checked={completion === 'log'} className={completion === 'log' ? 'on' : ''} onClick={() => setCompletion('log')}>Log details</button>
          </div>
          <span className="small">{chore
            ? (completion === 'done' ? 'One tap and it’s done, with hearts. Nothing is logged.' : 'Logged in an item’s history, like cleaning the coop going into the hens’ log. Today shows Log instead of Done.')
            : (completion === 'done' ? 'One tap and it’s done, with hearts. Good for chores.' : 'Opens a form for a date, a note or a reading. Good for services and repairs.')}</span>
          {chore && completion === 'log' && logTargets.length > 0 && <ItemPicker items={logTargets} name="logs_to" label="Log it on" />}
        </fieldset>
      )}
    </fieldset>
  );
}
