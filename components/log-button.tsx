'use client';

import { useState, useTransition } from 'react';
import { abortMission, logEvent, quickDone } from '@/app/actions';
import { addDays } from '@/src/engine/dates';
import { celebrate } from './hearts';
import { useToast } from './toast';

export interface LogTarget {
  objectId: string;
  objectName: string;
  kinds: string[];
  meterUnit: string | null;
  /** Items with turns (dishes): whose turn this was. */
  turns?: { ruleId: string; label: string; ownerId: string }[];
  ruleId?: string | null;
  meId?: string;
}

export function LogButton({ target, today, kidName, label = 'Log', className = 'btn btn-primary', style }: {
  target: LogTarget; today: string; kidName?: string | null; label?: string; className?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <LogSheet
          target={target}
          today={today}
          onClose={() => setOpen(false)}
          onLogged={(waiting) => {
            setOpen(false);
            if (kidName) celebrate({ message: `Nice one, ${kidName}!` });
            toast.show(waiting ? 'Saved. Mum or Dad will check it, then it counts.' : 'Logged.');
          }}
        />
      )}
      {toast.node}
    </>
  );
}

function LogSheet({ target, today, onClose, onLogged }: {
  target: LogTarget; today: string; onClose: () => void; onLogged: (waiting: boolean) => void;
}) {
  const kinds = target.kinds.length ? target.kinds : ['Done'];
  const [kind, setKind] = useState<number | 'other'>(0);
  const [other, setOther] = useState('');
  const [when, setWhen] = useState<'today' | 'yesterday' | 'pick'>('today');
  const [picked, setPicked] = useState(today);
  const [meter, setMeter] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const turns = target.turns ?? [];
  const [turn, setTurn] = useState<string | null>(
    target.ruleId ?? turns.find((t) => t.ownerId === target.meId)?.ruleId ?? turns[0]?.ruleId ?? null);

  const kindName = kind === 'other' ? other.trim() : kinds[kind];
  const occurredOn = when === 'today' ? today : when === 'yesterday' ? addDays(today, -1) : picked;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await logEvent({
        objectId: target.objectId, kind: kindName, occurredOn,
        meterValue: meter ? Number(meter.replace(/\s/g, '').replace(',', '.')) : null,
        meterUnit: target.meterUnit, note, ruleId: turns.length ? turn : target.ruleId ?? null,
      });
      if (res.ok) onLogged(!!res.waiting);
      else setError(res.error);
    });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Log on ${target.objectName}`} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-handle" />
        <div className="row">
          <h2 style={{ fontSize: 20 }}>{target.objectName}</h2>
          <span className="spacer" />
          <button type="button" className="btn-text btn" onClick={onClose} style={{ color: 'var(--text-2)', fontWeight: 400 }}>Cancel</button>
        </div>

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>What happened?</legend>
          <div className="wrap">
            {kinds.map((k, i) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === i} onClick={() => setKind(i)}>{k}</button>
            ))}
            <button type="button" className="chip" aria-pressed={kind === 'other'} onClick={() => setKind('other')}>Something else</button>
          </div>
          {kind === 'other' && (
            <label className="field">Call it
              <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} maxLength={80}
                placeholder="e.g. Battery replaced, Bought new chain" />
            </label>
          )}
        </fieldset>

        {turns.length > 0 && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ marginBottom: 8 }}>Whose turn was it?</legend>
            <div className="wrap">
              {turns.map((t) => (
                <button key={t.ruleId} type="button" className="chip" aria-pressed={turn === t.ruleId} onClick={() => setTurn(t.ruleId)}>{t.label}</button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>When?</legend>
          <div className="wrap">
            {(['today', 'yesterday', 'pick'] as const).map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={when === w} onClick={() => setWhen(w)}>
                {w === 'today' ? 'Today' : w === 'yesterday' ? 'Yesterday' : 'Pick a date'}
              </button>
            ))}
          </div>
          {when === 'pick' && (
            <label className="field">Date
              <input type="date" value={picked} max={today} onChange={(e) => setPicked(e.target.value)} />
            </label>
          )}
        </fieldset>

        {target.meterUnit && (
          <label className="field">Reading in {target.meterUnit} (optional)
            <input inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder={target.meterUnit === 'km' ? 'e.g. 197850' : 'e.g. 1425'} />
          </label>
        )}

        <label className="field">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. left headlight, H7 bulb" />
        </label>

        {error && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || !kindName}>{busy ? 'Saving…' : 'Log it'}</button>
      </form>
    </div>
  );
}

/** One tap: done today, hearts float up, and "Undo" for a few seconds (shown by CelebrationHost). */
export function DoneButton({ objectId, ruleId, kidName, label = 'Done', className = 'btn btn-primary', style }: {
  objectId: string; ruleId: string | null; kidName?: string | null; label?: string; className?: string; style?: React.CSSProperties;
}) {
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <button type="button" className={className} style={style} disabled={busy}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const at = { x: box.left + box.width / 2, y: box.top };
          start(async () => {
            const r = await quickDone(objectId, ruleId);
            if (!r.ok) { toast.show(r.error); return; }
            celebrate({ at, undo: { eventId: r.eventId!, objectId, waiting: !!r.waiting } });
          });
        }}>
        {busy ? '…' : label}
      </button>
      {toast.node}
    </>
  );
}

/** For someone tagged on a group task who didn't take part. */
export function AbortButton({ objectId, ruleId }: { objectId: string; ruleId: string }) {
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState(false);
  const toast = useToast();
  return (
    <>
      <button type="button" className="btn btn-text abort" disabled={busy}
        onClick={() => {
          if (!asked) { setAsked(true); setTimeout(() => setAsked(false), 4000); return; }
          start(async () => { const r = await abortMission(objectId, ruleId); toast.show(r.ok ? (r.message ?? '') : r.error); });
        }}>
        {asked ? 'Sure? Tap again' : 'Abort mission'}
      </button>
      {toast.node}
    </>
  );
}
