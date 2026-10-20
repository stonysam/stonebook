'use client';

import { useState } from 'react';
import type { MemberRow } from '@/lib/database.types';
import { WEEKDAYS } from '@/lib/format';

/**
 * When an activity, work shift or appointment is: every week on set days, or once on a date; who's going; who drives.
 * In the Add form, "Who's going?" is the only who-question: the first person going (that you may add things for) owns it.
 */
export function ActivityFields({ members, meId, owner, today, onPeople, canChoose }: {
  members: MemberRow[]; meId: string; owner: string; today: string;
  onPeople?: (ids: string[]) => void;
  /** Add form only: who this person may add things for. */
  canChoose?: string[];
}) {
  const [when, setWhen] = useState<'weekly' | 'once'>('weekly');
  const [days, setDays] = useState<number[]>([]);
  const [going, setGoing] = useState<string[]>([]); // empty: just the person it belongs to
  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const drivers = members.filter((m) => m.role === 'parent' || m.role === 'member');
  const name = (m: MemberRow) => (m.id === meId ? 'Me' : m.display_name);
  const people = going.length ? going : [owner];
  const everyone = members.every((m) => people.includes(m.id));
  const choose = (next: string[]) => {
    const list = next.length ? next : [owner];
    setGoing(list);
    onPeople?.(list);
  };
  const togglePerson = (id: string) => choose(people.includes(id) ? people.filter((x) => x !== id) : [...people, id]);
  const ownerId = canChoose ? (people.find((id) => canChoose.includes(id)) ?? canChoose[0]) : owner;

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
      <legend className="small" style={{ marginBottom: 8 }}>When is it?</legend>
      <input type="hidden" name="slot_when" value={when} />
      <div className="seg" role="radiogroup" aria-label="How often">
        <button type="button" role="radio" aria-checked={when === 'weekly'} className={when === 'weekly' ? 'on' : ''} onClick={() => setWhen('weekly')}>Every week</button>
        <button type="button" role="radio" aria-checked={when === 'once'} className={when === 'once' ? 'on' : ''} onClick={() => setWhen('once')}>Just once</button>
      </div>
      {when === 'weekly' ? (
        <>
          <div className="days">
            {WEEKDAYS.map(([n, short, full]) => (
              <button key={n} type="button" className="day" aria-pressed={days.includes(n)} aria-label={full} onClick={() => toggle(n)}>{short}</button>
            ))}
          </div>
          {days.map((d) => <input key={d} type="hidden" name="slot_days" value={d} />)}
        </>
      ) : (
        <label className="field">Date<input type="date" name="slot_date" min={today} required /></label>
      )}
      <div className="row">
        <label className="field" style={{ flex: '1 1 0' }}>Starts (optional)<input type="time" name="starts_at" step={300} /></label>
        <label className="field" style={{ flex: '1 1 0' }}>Ends (optional)<input type="time" name="ends_at" step={300} /></label>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ marginBottom: 8 }}>Who&apos;s going?</legend>
        <div className="wrap">
          <button type="button" className="chip" aria-pressed={everyone} onClick={() => choose(everyone ? [owner] : members.map((m) => m.id))}>Everyone</button>
          {members.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={people.includes(m.id)} onClick={() => togglePerson(m.id)}>{name(m)}</button>
          ))}
        </div>
        {people.map((id) => <input key={id} type="hidden" name="slot_people" value={id} />)}
        {canChoose && <input type="hidden" name="owner_id" value={ownerId} />}
      </fieldset>

      <div className="row">
        <label className="field" style={{ flex: '1 1 0' }}>{when === 'once' ? 'Drops off' : 'Usually drops off'}
          <select name="drop_off_by" defaultValue="">
            <option value="">Nobody</option>
            {drivers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 0' }}>{when === 'once' ? 'Picks up' : 'Usually picks up'}
          <select name="pick_up_by" defaultValue="">
            <option value="">Nobody</option>
            {drivers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
          </select>
        </label>
      </div>
      {when === 'weekly' && <span className="small">Different times on other days? Add them from its page after saving. Any single week can be changed there too.</span>}
    </fieldset>
  );
}
