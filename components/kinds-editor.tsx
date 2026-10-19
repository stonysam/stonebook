'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { addField, createKind, fieldUsage, move, removeField, removeKind, renameKind, setKindHidden, updateField } from '@/app/kinds-actions';
import type { ActionResult } from '@/app/actions';
import { FIELD_KINDS, type FieldKindChoice } from '@/lib/types';
import { useToast } from './toast';

type Result = ActionResult | undefined;

/** Runs a server action from a button and shows its message. */
function useAct() {
  const toast = useToast();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Result>) => start(async () => {
    const r = await fn();
    if (r && !r.ok) toast.show(r.error);
    else if (r?.ok && r.message) toast.show(r.message);
  });
  return { run, busy, node: toast.node };
}

function useFormToast(state: ActionResult | null, onOk?: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) { if (state.message) toast.show(state.message); onOk?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return toast.node;
}

export function MoveButtons({ table, id, first, last }: { table: 'object_types' | 'field_defs'; id: string; first: boolean; last: boolean }) {
  const { run, busy, node } = useAct();
  return (
    <span className="row" style={{ gap: 4 }}>
      <button type="button" className="btn btn-text icon-btn" aria-label="Move up" disabled={busy || first} onClick={() => run(() => move(table, id, -1))}>↑</button>
      <button type="button" className="btn btn-text icon-btn" aria-label="Move down" disabled={busy || last} onClick={() => run(() => move(table, id, 1))}>↓</button>
      {node}
    </span>
  );
}

export function NewKindForm() {
  const [state, action, pending] = useActionState(createKind, null);
  return (
    <form action={action} className="card stack" style={{ gap: 10 }}>
      <label className="field">A new kind of thing
        <input name="name" maxLength={40} required placeholder="e.g. Cabin, Bike, Garden bed" />
      </label>
      {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Adding…' : 'Add it'}</button>
    </form>
  );
}

export function KindControls({ id, name, builtIn, hidden }: { id: string; name: string; builtIn: boolean; hidden: boolean }) {
  const { run, busy, node } = useAct();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [sure, setSure] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {editing ? (
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await renameKind(id, draft); if (r.ok) setEditing(false); return r; }); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} aria-label="Name" style={{ flex: '1 1 auto' }} />
          <button className="btn btn-primary" disabled={busy}>Save</button>
          <button type="button" className="btn btn-text" onClick={() => { setDraft(name); setEditing(false); }}>Cancel</button>
        </form>
      ) : null}
      <div className="wrap" style={{ gap: 8 }}>
        {!builtIn && !editing && <button type="button" className="btn" onClick={() => setEditing(true)}>Rename</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => setKindHidden(id, !hidden))}>
          {hidden ? 'Show in Add' : 'Hide from Add'}
        </button>
        {!builtIn && (
          <button type="button" className="btn" disabled={busy} onClick={() => (sure ? run(() => removeKind(id)) : setSure(true))}>
            {sure ? 'Sure? Tap again' : 'Remove this kind'}
          </button>
        )}
      </div>
      {builtIn && <span className="small">One of the app’s own kinds: its name stays, but you can add and change its details.</span>}
      {node}
    </div>
  );
}

function OptionsInput({ initial }: { initial?: string[] }) {
  return (
    <label className="field">Answers to pick from (one per line)
      <textarea name="options" rows={4} defaultValue={(initial ?? []).join('\n')} placeholder={'e.g.\nSmall\nMedium\nLarge'} />
    </label>
  );
}

export function AddFieldForm({ typeId, hasThings, hasPhoto }: { typeId: string; hasThings: boolean; hasPhoto: boolean }) {
  const [state, action, pending] = useActionState(addField, null);
  const [kind, setKind] = useState<FieldKindChoice>('text');
  const [key, setKey] = useState(0);
  const toast = useFormToast(state, () => { setKind('text'); setKey((k) => k + 1); });
  return (
    <form key={key} action={action} className="card stack" style={{ gap: 12 }}>
      <input type="hidden" name="type_id" value={typeId} />
      <label className="field">New detail
        <input name="label" maxLength={40} required placeholder="e.g. Tyre size, Sleeps, Key code" />
      </label>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ marginBottom: 8 }}>What goes in it?</legend>
        <input type="hidden" name="kind" value={kind} />
        <div className="wrap">
          {FIELD_KINDS.filter(([k]) => k !== 'photo' || !hasPhoto).map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
      </fieldset>
      {kind === 'choice' && (
        <>
          <OptionsInput />
          <label className="row" style={{ minHeight: 44 }}>
            <input type="checkbox" name="multiple" style={{ width: 22, minHeight: 22 }} />
            <span>Can pick several</span>
          </label>
        </>
      )}
      {kind !== 'photo' && (
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" name="required" disabled={hasThings} style={{ width: 22, minHeight: 22 }} />
          <span>Must be filled in{hasThings ? ' (not for a kind that already has things)' : ''}</span>
        </label>
      )}
      {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Adding…' : 'Add detail'}</button>
      {toast}
    </form>
  );
}

export function FieldRow({ field, kindLabel, locked, first, last }: {
  field: { id: string; label: string; kind: string; options: string[] | null; multiple: boolean; required: boolean; key: string };
  kindLabel: string; locked: boolean; first: boolean; last: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateField, null);
  const toast = useFormToast(state, () => setOpen(false));
  const { run, busy, node } = useAct();
  const [confirm, setConfirm] = useState<number | null>(null);
  const photo = field.key === 'photo';

  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 2, flex: '1 1 auto', minWidth: 0 }}>
          <span className="item-title">{field.label}</span>
          <span className="small">
            {kindLabel}{field.kind === 'choice' && field.options ? `: ${field.options.join(', ')}` : ''}{field.multiple ? ' (several)' : ''}{field.required ? ' · must be filled in' : ''}
          </span>
        </div>
        <MoveButtons table="field_defs" id={field.id} first={first} last={last} />
      </div>
      <div className="wrap" style={{ gap: 8 }}>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Change'}</button>
        {!locked && (
          <button type="button" className="btn" disabled={busy} onClick={() => {
            if (confirm === null) run(async () => { setConfirm(await fieldUsage(field.id)); return undefined; });
            else run(() => removeField(field.id));
          }}>
            {confirm === null ? 'Remove' : confirm ? `Clears it from ${confirm} ${confirm === 1 ? 'thing' : 'things'}. Tap again` : 'Sure? Tap again'}
          </button>
        )}
      </div>
      {locked && <span className="small">The app relies on this detail, so it can’t be removed.</span>}
      {open && (
        <form action={action} className="stack" style={{ gap: 12 }}>
          <input type="hidden" name="field_id" value={field.id} />
          <label className="field">Name<input name="label" defaultValue={field.label} maxLength={40} required /></label>
          {field.kind === 'choice' && (
            <>
              <OptionsInput initial={field.options ?? []} />
              <label className="row" style={{ minHeight: 44 }}>
                <input type="checkbox" name="multiple" defaultChecked={field.multiple} style={{ width: 22, minHeight: 22 }} />
                <span>Can pick several</span>
              </label>
            </>
          )}
          {!photo && (
            <label className="row" style={{ minHeight: 44 }}>
              <input type="checkbox" name="required" defaultChecked={field.required} style={{ width: 22, minHeight: 22 }} />
              <span>Must be filled in</span>
            </label>
          )}
          {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
          <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        </form>
      )}
      {toast}{node}
    </div>
  );
}
