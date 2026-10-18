'use client';

import { useActionState, useState } from 'react';
import { createItem } from '@/app/actions';
import type { FieldDefRow, MemberRow } from '@/lib/database.types';
import { FieldInput, VisibilityPicker } from './item-tools';
import { ScheduleFields } from './schedule-fields';

const PLACEHOLDER: Record<string, string> = {
  Chore: 'e.g. Feed the hens', Vehicle: 'e.g. Kia', Machine: 'e.g. Chainsaw', 'Animal or flock': 'e.g. Sheep flock',
  'Home system': 'e.g. Well water filter', Document: 'e.g. Ziah’s passport', Bill: 'e.g. Electricity', Subscription: 'e.g. Netflix', Person: 'e.g. Benji',
};

export function AddForm({ typeId, typeName, defs, members, owners, meId, initialOwner }: {
  typeId: string; typeName: string; defs: FieldDefRow[]; members: MemberRow[]; owners: MemberRow[]; meId: string; initialOwner: string;
}) {
  const [state, action, pending] = useActionState(createItem, null);
  const [owner, setOwner] = useState(initialOwner);
  const ownerName = (m: MemberRow) => (m.id === meId ? 'Me' : m.display_name);

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <input type="hidden" name="type_id" value={typeId} />
      <label className="field">Name
        <input name="name" required maxLength={120} placeholder={PLACEHOLDER[typeName] ?? 'Give it a name'} autoFocus />
      </label>

      {owners.length > 1 && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>{typeName === 'Chore' ? 'Whose chore?' : 'Who looks after it?'}</legend>
          <input type="hidden" name="owner_id" value={owner} />
          <div className="wrap">
            {owners.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>{ownerName(m)}</button>
            ))}
          </div>
        </fieldset>
      )}
      {owners.length === 1 && <input type="hidden" name="owner_id" value={owners[0].id} />}

      <VisibilityPicker key={owner} initial={typeName === 'Document' || typeName === 'Person' ? 'personal' : 'shared'} canPrivate={owner === meId} />

      {defs.map((d) => <FieldInput key={d.id} def={d} value={null} members={members} />)}

      <ScheduleFields typeName={typeName} />

      {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
      <button className="btn btn-primary btn-big" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
