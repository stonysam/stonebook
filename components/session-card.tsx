'use client';

import { useState, useTransition } from 'react';
import { changeSession } from '@/app/actions';
import Link from './link';
import { useToast } from './toast';

export interface SessionView {
  slotId: string;
  objectId: string;
  title: string; // "Scouts"
  who: string; // "Lucy"
  date: string;
  dateLabel: string; // "Today", "Thu 23 Oct"
  time: string; // "17:00–19:00"
  dropOffBy: string | null;
  pickUpBy: string | null;
  cancelled: boolean;
  changed: boolean;
  note: string | null;
}

/** One time an activity happens, with who drives; people who may change it get "Change". */
export function SessionCard({ s, drivers, names, canChange, showTitle = true }: {
  s: SessionView; drivers: { id: string; name: string }[]; names: Record<string, string>; canChange: boolean; showTitle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const driving = [
    s.dropOffBy ? `Drop-off: ${names[s.dropOffBy] ?? '?'}` : null,
    s.pickUpBy ? `Pick-up: ${names[s.pickUpBy] ?? '?'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`card row${s.cancelled ? ' dashed' : ''}`} style={{ padding: '12px 8px 12px 16px', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }} className="stack">
        <span className="small">{s.dateLabel} · {s.time}</span>
        {showTitle && (
          <Link href={`/things/${s.objectId}`} className="card-link" style={{ position: 'static' }}>
            <span className="item-title" style={s.cancelled ? { textDecoration: 'line-through' } : undefined}>{s.who} · {s.title}</span>
          </Link>
        )}
        <span className={s.cancelled ? 'muted' : ''} style={{ fontSize: 14 }}>
          {s.cancelled ? 'Off this time' : driving || 'No lift needed'}
          {s.changed && !s.cancelled ? ' (changed)' : ''}
        </span>
        {s.note && <span className="small">{s.note}</span>}
      </div>
      {canChange && <button type="button" className="btn btn-text" onClick={() => setOpen(true)}>Change</button>}
      {open && <ChangeSheet s={s} drivers={drivers} onClose={() => setOpen(false)} onSaved={(m) => { setOpen(false); toast.show(m); }} />}
      {toast.node}
    </div>
  );
}

function ChangeSheet({ s, drivers, onClose, onSaved }: {
  s: SessionView; drivers: { id: string; name: string }[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [drop, setDrop] = useState(s.dropOffBy ?? '');
  const [pick, setPick] = useState(s.pickUpBy ?? '');
  const [off, setOff] = useState(s.cancelled);
  const [note, setNote] = useState(s.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const send = (reset: boolean) => start(async () => {
    const r = await changeSession({ slotId: s.slotId, date: s.date, cancelled: off, dropOffBy: drop || null, pickUpBy: pick || null, note, reset });
    if (r.ok) onSaved(r.message ?? 'Saved.'); else setError(r.error);
  });

  const picker = (label: string, value: string, set: (v: string) => void) => (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ marginBottom: 8 }}>{label}</legend>
      <div className="wrap">
        {drivers.map((d) => <button key={d.id} type="button" className="chip" aria-pressed={value === d.id} onClick={() => set(d.id)}>{d.name}</button>)}
        <button type="button" className="chip" aria-pressed={value === ''} onClick={() => set('')}>Nobody</button>
      </div>
    </fieldset>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Change ${s.title} on ${s.dateLabel}`}
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); send(false); }}>
        <div className="sheet-handle" />
        <div>
          <h2 style={{ fontSize: 20 }}>{s.who} · {s.title}</h2>
          <span className="small">{s.dateLabel} · {s.time}. Changes this date only.</span>
        </div>
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} style={{ width: 22, minHeight: 22 }} />
          <span>It&apos;s off this time</span>
        </label>
        {!off && picker('Drop-off', drop, setDrop)}
        {!off && picker('Pick-up', pick, setPick)}
        <label className="field">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. finishes late, bring the kit" />
        </label>
        {error && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Saving…' : 'Save for this date'}</button>
        {s.changed && <button type="button" className="btn" disabled={busy} onClick={() => send(true)}>Back to the usual</button>}
        <button type="button" className="btn btn-text" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
