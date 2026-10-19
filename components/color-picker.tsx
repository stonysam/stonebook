'use client';

import { useOptimistic, useTransition } from 'react';
import { setMemberColor } from '@/app/actions';
import type { PersonColor } from '@/lib/database.types';
import { PALETTE } from '@/lib/people';
import { useToast } from './toast';

/** Parents choose each person's colour from the app's palette. */
export function ColorPicker({ memberId, current, name }: { memberId: string; current: PersonColor; name: string }) {
  const [shown, setShown] = useOptimistic(current);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ marginBottom: 8 }}>Colour for {name} tasks and activities</legend>
      <div className="swatches">
        {PALETTE.map((p) => (
          <button key={p.key} type="button" className={`swatch pc-${p.key}`} aria-pressed={shown === p.key} aria-label={p.label}
            onClick={() => start(async () => { setShown(p.key); const r = await setMemberColor(memberId, p.key); if (!r.ok) toast.show(r.error); })} />
        ))}
      </div>
      {toast.node}
    </fieldset>
  );
}
