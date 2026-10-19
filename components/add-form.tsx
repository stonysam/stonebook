'use client';

import { useActionState, useState } from 'react';
import { createItem } from '@/app/actions';
import type { FieldDefRow, MemberRow, Visibility } from '@/lib/database.types';
import { isActivity, isChore, typeUi } from '@/lib/types';
import { ActivityFields } from './activity-fields';
import { DetailFields, VisibilityPicker, type GroupOption } from './item-tools';
import { ScheduleFields } from './schedule-fields';

export function AddForm({ typeId, typeName, defs, members, owners, meId, isParent, initialOwner, today, grouped = false, groups = [], parentId = null }: {
  typeId: string; typeName: string; defs: FieldDefRow[]; members: MemberRow[]; owners: MemberRow[]; meId: string;
  isParent: boolean; initialOwner: string; today: string;
  /** Animals: one or a group, and which group. */
  grouped?: boolean; groups?: GroupOption[]; parentId?: string | null;
}) {
  const [state, action, pending] = useActionState(createItem, null);
  const chore = isChore(typeName);
  const activity = isActivity(typeName);
  // Chores and activities ask who once, further down (Who does it? / Who's going?); other things ask here.
  const [picked, setPicked] = useState<string[]>([initialOwner]);
  const owner = picked[0] ?? initialOwner;
  const ui = typeUi(typeName);
  const ownerName = (m: MemberRow) => (m.id === meId ? 'Me' : m.display_name);
  // A chore for someone else, or a group job, is always shared, so everyone on it can see it.
  const givingAway = (!isParent && owner !== meId) || picked.length > 1;
  const initialVis: Visibility = typeName === 'Document' || typeName === 'Person' ? 'personal' : 'shared';

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <input type="hidden" name="type_id" value={typeId} />
      <label className="field">{isChore(typeName) ? 'What needs doing?' : 'Name'}
        <input name="name" required maxLength={120} placeholder={ui.placeholder} autoFocus />
      </label>

      {owners.length > 1 && !chore && !activity && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 8 }}>{ui.ownerQuestion}</legend>
          <input type="hidden" name="owner_id" value={owner} />
          <div className="wrap">
            {owners.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={picked.includes(m.id)} onClick={() => setPicked([m.id])}>{ownerName(m)}</button>
            ))}
          </div>
        </fieldset>
      )}
      {owners.length === 1 && !chore && !activity && <input type="hidden" name="owner_id" value={owners[0].id} />}

      {givingAway
        ? <><input type="hidden" name="visibility" value="shared" /><span className="small">Shared with the family, so everyone on it can see it.</span></>
        : <VisibilityPicker key={owner} initial={initialVis} canPrivate={owner === meId} />}

      <DetailFields defs={defs} values={{}} members={members} grouped={grouped} groups={groups} parentId={parentId} />

      {activity
        ? <ActivityFields members={members} meId={meId} owner={owner} today={today} onPeople={setPicked} canChoose={owners.map((m) => m.id)} />
        : <ScheduleFields typeName={typeName} members={chore ? owners : members} owner={owner} meId={meId} today={today} inAddForm onPeople={setPicked} />}

      {state && !state.ok && <p role="alert" style={{ margin: 0, fontWeight: 600 }}>{state.error}</p>}
      <button className="btn btn-primary btn-big" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
