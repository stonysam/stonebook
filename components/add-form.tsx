'use client';

import { useActionState, useState } from 'react';
import { createItem } from '@/app/actions';
import type { FieldDefRow, MemberRow, Visibility } from '@/lib/database.types';
import { isActivity, isChore, typeUi } from '@/lib/types';
import { ActivityFields } from './activity-fields';
import { FieldInput, VisibilityPicker } from './item-tools';
import { ScheduleFields } from './schedule-fields';

export function AddForm({ typeId, typeName, defs, members, owners, meId, isParent, initialOwner, today }: {
  typeId: string; typeName: string; defs: FieldDefRow[]; members: MemberRow[]; owners: MemberRow[]; meId: string;
  isParent: boolean; initialOwner: string; today: string;
}) {
  const [state, action, pending] = useActionState(createItem, null);
  const [owner, setOwner] = useState(initialOwner);
  const ui = typeUi(typeName);
  const ownerName = (m: MemberRow) => (m.id === meId ? 'Me' : m.display_name);
  const givingAway = !isParent && owner !== meId; // a chore or task for someone else: always shared
  const initialVis: Visibility = typeName === 'Document' || typeName === 'Person' ? 'personal' : 'shared';

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <input type="hidden" name="type_id" value={typeId} />
      <label className="field">{isChore(typeName) ? 'What needs doing?' : 'Name'}
        <input name="name" required maxLength={120} placeholder={ui.placeholder} autoFocus />
      </label>

      {owners.length > 1 && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>{ui.ownerQuestion}</legend>
          <input type="hidden" name="owner_id" value={owner} />
          <div className="wrap">
            {owners.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={owner === m.id} onClick={() => setOwner(m.id)}>{ownerName(m)}</button>
            ))}
          </div>
        </fieldset>
      )}
      {owners.length === 1 && <input type="hidden" name="owner_id" value={owners[0].id} />}

      {givingAway
        ? <><input type="hidden" name="visibility" value="shared" /><span className="small">Shared with the family, so you can both see it.</span></>
        : <VisibilityPicker key={owner} initial={initialVis} canPrivate={owner === meId} />}

      {defs.map((d) => <FieldInput key={d.id} def={d} value={null} members={members} />)}

      {isActivity(typeName)
        ? <ActivityFields members={members} meId={meId} />
        : <ScheduleFields typeName={typeName} members={members} owner={owner} meId={meId} today={today} inAddForm />}

      {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
      <button className="btn btn-primary btn-big" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
