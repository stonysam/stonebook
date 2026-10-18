'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/format';

type How = 'none' | 'daily' | 'weekly' | 'interval' | 'meter' | 'date' | 'record';

/** "When is it due?" inputs, posted with the surrounding form (fields: how, what, days, every_n …). */
export function ScheduleFields({ typeName, allowNone = true }: { typeName: string; allowNone?: boolean }) {
  const isChore = typeName === 'Chore';
  const hasMeter = typeName === 'Vehicle' || typeName === 'Machine';
  const options: [How, string][] = isChore
    ? [['daily', 'Every day'], ['weekly', 'On set days'], ['interval', 'Every few weeks'], ['date', 'Once, on a date']]
    : [
        ['interval', 'Every few months'],
        ...(hasMeter ? [['meter', 'By km or hours'] as [How, string]] : []),
        ['date', 'On a date'],
        ['weekly', 'On set days'],
        ['record', 'Just keep history'],
      ];
  if (allowNone) options.push(['none', 'No reminder']);
  const [how, setHow] = useState<How>(isChore ? 'weekly' : options[0][0]);
  const [days, setDays] = useState<number[]>([]);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const dayNames = WEEKDAYS.filter(([n]) => days.includes(n)).map(([, , full]) => full);

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
      <legend className="small" style={{ marginBottom: 8 }}>When is it due?</legend>
      <input type="hidden" name="how" value={how} />
      <div className="wrap">
        {options.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={how === value} onClick={() => setHow(value)}>{label}</button>
        ))}
      </div>

      {how !== 'none' && how !== 'record' && !isChore && (
        <label className="field">What gets done?
          <input name="what" maxLength={80} placeholder={hasMeter ? 'e.g. Oil change, Service' : 'e.g. Filter changed, Renewed, Paid'} required />
        </label>
      )}
      {isChore && <input type="hidden" name="what" value="Done" />}

      {how === 'weekly' && (
        <div className="card stack" style={{ background: 'var(--surface-2)', border: 0 }}>
          <span>Which days?</span>
          <div className="days">
            {WEEKDAYS.map(([n, short, full]) => (
              <button key={n} type="button" className="day" aria-pressed={days.includes(n)} aria-label={full} onClick={() => toggleDay(n)}>{short}</button>
            ))}
          </div>
          {days.map((d) => <input key={d} type="hidden" name="days" value={d} />)}
          <span className="small">{dayNames.length ? `Due every ${dayNames.join(' and ')}.` : 'Tap the days, e.g. Tuesday and Friday.'}</span>
        </div>
      )}

      {how === 'interval' && (
        <div className="row">
          <label className="field" style={{ flex: '0 0 96px' }}>Every
            <input name="every_n" inputMode="numeric" defaultValue={isChore ? 2 : 6} required />
          </label>
          <label className="field" style={{ flex: '1 1 auto' }}>&nbsp;
            <select name="every_unit" defaultValue={isChore ? 'weeks' : 'months'}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </label>
        </div>
      )}
      {how === 'interval' && !isChore && (
        <label className="field">Last done (optional, so the first reminder is right)
          <input type="date" name="last_done" />
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

      {how === 'date' && (
        <>
          <label className="field">Date
            <input type="date" name="due_on" required />
          </label>
          {!isChore && (
            <label className="field">Repeats every … months (optional)
              <input name="renew_months" inputMode="numeric" placeholder="e.g. 1 for a monthly bill, 12 for yearly" />
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
