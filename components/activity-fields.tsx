'use client';

import { useState } from 'react';
import type { MemberRow } from '@/lib/database.types';
import { WEEKDAYS } from '@/lib/format';

/** Weekly time for an activity or work: days, start and end, who drops off and picks up. */
export function ActivityFields({ members, meId }: { members: MemberRow[]; meId: string }) {
  const [days, setDays] = useState<number[]>([]);
  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const drivers = members.filter((m) => m.role === 'parent' || m.role === 'member');
  const name = (m: MemberRow) => (m.id === meId ? 'Me' : m.display_name);

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
      <legend className="small" style={{ marginBottom: 8 }}>When is it?</legend>
      <div className="days">
        {WEEKDAYS.map(([n, short, full]) => (
          <button key={n} type="button" className="day" aria-pressed={days.includes(n)} aria-label={full} onClick={() => toggle(n)}>{short}</button>
        ))}
      </div>
      {days.map((d) => <input key={d} type="hidden" name="slot_days" value={d} />)}
      <div className="row">
        <label className="field" style={{ flex: '1 1 0' }}>Starts<input type="time" name="starts_at" required step={300} /></label>
        <label className="field" style={{ flex: '1 1 0' }}>Ends (optional)<input type="time" name="ends_at" step={300} /></label>
      </div>
      <div className="row">
        <label className="field" style={{ flex: '1 1 0' }}>Usually drops off
          <select name="drop_off_by" defaultValue="">
            <option value="">Nobody</option>
            {drivers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 0' }}>Usually picks up
          <select name="pick_up_by" defaultValue="">
            <option value="">Nobody</option>
            {drivers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
          </select>
        </label>
      </div>
      <span className="small">Different times on other days? Add them from its page after saving. Any single week can be changed there too.</span>
    </fieldset>
  );
}
