'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { addRule, addSlot, correctEvent, setArchived, stopRule, stopSlot, updateDetails, type ActionResult } from '@/app/actions';
import { isActivity } from '@/lib/types';
import { ActivityFields } from './activity-fields';
import { CHORE_PICTURES, ChoreIcon } from './chore-icons';
import type { FieldDefRow, MemberRow, Visibility } from '@/lib/database.types';
import { ScheduleFields } from './schedule-fields';
import { useToast } from './toast';

export function FieldInput({ def, value, members }: { def: FieldDefRow; value: unknown; members: MemberRow[] }) {
  const name = `f_${def.key}`;
  const v = value == null ? '' : String(value);
  const label = `${def.label}${def.required ? '' : ' (optional)'}`;
  if (def.key === 'picture') return <PicturePicker name={name} initial={v} label={label} />;
  if (def.kind === 'choice') {
    const opts = Array.isArray(def.options) ? (def.options as string[]) : [];
    return (
      <label className="field">{label}
        <select name={name} defaultValue={v} required={def.required}>
          <option value="">Choose…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (def.kind === 'person') {
    return (
      <label className="field">{label}
        <select name={name} defaultValue={v} required={def.required}>
          <option value="">Choose…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="field">{label}
      <input name={name} defaultValue={v} required={def.required}
        type={def.kind === 'date' ? 'date' : 'text'} inputMode={def.kind === 'number' ? 'decimal' : undefined} />
    </label>
  );
}

function PicturePicker({ name, initial, label }: { name: string; initial: string; label: string }) {
  const [pick, setPick] = useState(initial);
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ marginBottom: 8 }}>{label}</legend>
      <input type="hidden" name={name} value={pick} />
      <div className="wrap" style={{ gap: 6 }}>
        {CHORE_PICTURES.map((p) => (
          <button key={p} type="button" className="day" aria-pressed={pick === p} aria-label={p} onClick={() => setPick(pick === p ? '' : p)}
            style={{ width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChoreIcon name={p} size={30} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function VisibilityPicker({ initial, canPrivate, initialShare = false }: { initial: Visibility; canPrivate: boolean; initialShare?: boolean }) {
  const [vis, setVis] = useState<Visibility>(initial);
  const help: Record<Visibility, string> = {
    shared: 'The whole family sees it.',
    personal: 'The owner and both parents see it.',
    private: 'Only the owner sees it. Not even Mum and Dad.',
  };
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ marginBottom: 8 }}>Who can see it?</legend>
      <input type="hidden" name="visibility" value={vis} />
      <div className="wrap">
        {(['shared', 'personal', 'private'] as Visibility[]).map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={vis === v} disabled={v === 'private' && !canPrivate} onClick={() => setVis(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <span className="small">{help[vis]}{!canPrivate ? ' Only someone adding a thing for themselves can make it private.' : ''}</span>
      {vis === 'personal' && (
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" name="share_with_family" defaultChecked={initialShare} style={{ width: 22, minHeight: 22 }} />
          <span>Share with the whole family</span>
        </label>
      )}
    </fieldset>
  );
}

function useResultToast(state: ActionResult | null, onOk?: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) { if (state.message) toast.show(state.message); onOk?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return toast;
}

export function ItemActions(props: {
  objectId: string; name: string; typeName: string; archived: boolean; visibility: Visibility; shareWithFamily: boolean;
  canPrivate: boolean; defs: FieldDefRow[]; values: Record<string, unknown>; members: MemberRow[];
  ownerId: string; meId: string; today: string; canRemind: boolean;
}) {
  const activity = isActivity(props.typeName);
  const [mode, setMode] = useState<'none' | 'edit' | 'reminder'>('none');
  const [editState, editAction, editing] = useActionState(updateDetails, null);
  const [ruleState, ruleAction, addingRule] = useActionState(activity ? addSlot : addRule, null);
  const [busy, start] = useTransition();
  const editToast = useResultToast(editState, () => setMode('none'));
  const ruleToast = useResultToast(ruleState, () => setMode('none'));
  const toast = useToast();

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" style={{ flex: '1 1 0' }} aria-expanded={mode === 'edit'} onClick={() => setMode(mode === 'edit' ? 'none' : 'edit')}>
          {mode === 'edit' ? 'Cancel' : 'Edit details'}
        </button>
        {props.canRemind && <button type="button" className="btn" style={{ flex: '1 1 0' }} aria-expanded={mode === 'reminder'} onClick={() => setMode(mode === 'reminder' ? 'none' : 'reminder')}>
          {mode === 'reminder' ? 'Cancel' : activity ? 'Add times' : 'Add reminder'}
        </button>}
        <button type="button" className="btn" style={{ flex: '1 1 0' }} disabled={busy} onClick={() => start(async () => {
          const r = await setArchived(props.objectId, !props.archived);
          toast.show(r.ok ? (r.message ?? '') : r.error);
        })}>
          {props.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>

      {mode === 'edit' && (
        <form action={editAction} className="card stack" style={{ gap: 14, border: '2px solid var(--text)' }}>
          <input type="hidden" name="object_id" value={props.objectId} />
          <label className="field">Name<input name="name" defaultValue={props.name} required maxLength={120} /></label>
          {props.defs.map((d) => <FieldInput key={d.id} def={d} value={props.values[d.key]} members={props.members} />)}
          <VisibilityPicker initial={props.visibility} canPrivate={props.canPrivate} initialShare={props.shareWithFamily} />
          {editState && !editState.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{editState.error}</p>}
          <button className="btn btn-primary" disabled={editing}>{editing ? 'Saving…' : 'Save details'}</button>
        </form>
      )}

      {mode === 'reminder' && (
        <form action={ruleAction} className="card stack" style={{ gap: 14, border: '2px solid var(--text)' }}>
          <input type="hidden" name="object_id" value={props.objectId} />
          {activity
            ? <ActivityFields members={props.members} meId={props.meId} />
            : <ScheduleFields typeName={props.typeName} members={props.members} owner={props.ownerId} meId={props.meId} today={props.today} />}
          {ruleState && !ruleState.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{ruleState.error}</p>}
          <button className="btn btn-primary" disabled={addingRule}>{addingRule ? 'Saving…' : activity ? 'Add times' : 'Add reminder'}</button>
        </form>
      )}
      {editToast.node}{ruleToast.node}{toast.node}
    </div>
  );
}

export function StopSlotButton({ slotId }: { slotId: string }) {
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState(false);
  const toast = useToast();
  return (
    <>
      <button type="button" className="btn btn-text" style={{ minHeight: 36, alignSelf: 'flex-start' }} disabled={busy}
        onClick={() => {
          if (!asked) { setAsked(true); return; }
          start(async () => { const r = await stopSlot(slotId); toast.show(r.ok ? (r.message ?? '') : r.error); });
        }}>
        {asked ? 'Tap again to remove these times' : 'Remove these times'}
      </button>
      {toast.node}
    </>
  );
}

export function StopRuleButton({ ruleId }: { ruleId: string }) {
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState(false);
  const toast = useToast();
  return (
    <>
      <button type="button" className="btn btn-text" style={{ minHeight: 36, alignSelf: 'flex-start' }} disabled={busy}
        onClick={() => {
          if (!asked) { setAsked(true); return; }
          start(async () => { const r = await stopRule(ruleId); toast.show(r.ok ? (r.message ?? '') : r.error); });
        }}>
        {asked ? 'Tap again to stop this reminder' : 'Stop reminder'}
      </button>
      {toast.node}
    </>
  );
}

export function FixEntry(props: {
  eventId: string; objectId: string; kind: string; occurredOn: string; note: string | null;
  meterValue: number | null; meterUnit: string | null; today: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(props.kind);
  const [date, setDate] = useState(props.occurredOn);
  const [note, setNote] = useState(props.note ?? '');
  const [meter, setMeter] = useState(props.meterValue != null ? String(props.meterValue) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();

  const send = (remove: boolean) => start(async () => {
    const r = await correctEvent({
      eventId: props.eventId, objectId: props.objectId, kind, occurredOn: date, note, remove,
      meterValue: meter ? Number(meter.replace(',', '.')) : null, meterUnit: props.meterUnit,
    });
    if (r.ok) { setOpen(false); toast.show(r.message ?? 'Fixed.'); } else setError(r.error);
  });

  return (
    <>
      <button type="button" className="btn btn-text" onClick={() => setOpen(true)} aria-label={`Fix ${props.kind} on ${props.occurredOn}`}>Fix</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <form className="sheet" role="dialog" aria-modal="true" aria-label="Fix this entry" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); send(false); }}>
            <div className="sheet-handle" />
            <h2 style={{ fontSize: 20 }}>Fix this entry</h2>
            <p className="small" style={{ margin: 0 }}>The original stays in the history, marked as replaced.</p>
            <label className="field">What happened<input value={kind} onChange={(e) => setKind(e.target.value)} required maxLength={80} /></label>
            <label className="field">Date<input type="date" value={date} max={props.today} onChange={(e) => setDate(e.target.value)} required /></label>
            {props.meterUnit && (
              <label className="field">Reading in {props.meterUnit}<input inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} /></label>
            )}
            <label className="field">Note<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
            {error && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{error}</p>}
            <button className="btn btn-primary btn-big" disabled={busy}>Save the fix</button>
            <button type="button" className="btn" disabled={busy} onClick={() => send(true)}>Remove this entry</button>
            <button type="button" className="btn btn-text" onClick={() => setOpen(false)}>Cancel</button>
          </form>
        </div>
      )}
      {toast.node}
    </>
  );
}
