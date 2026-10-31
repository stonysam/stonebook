'use client';

import { useState, useTransition } from 'react';
import { quickDoneFor } from '@/app/actions';
import type { MemberRow } from '@/lib/database.types';
import { colorOf } from '@/lib/people';
import { celebrate } from './hearts';
import { useToast } from './toast';

/** A group job's people: tap someone who hasn't finished to mark their part done for them. */
export function GroupParts({ objectId, members, parts, meId }: {
  objectId: string; members: MemberRow[]; meId: string;
  parts: { memberId: string; ruleId: string; done: boolean }[];
}) {
  const [busy, start] = useTransition();
  const [ask, setAsk] = useState<string | null>(null);
  const toast = useToast();
  const name = (id: string) => (id === meId ? 'you' : members.find((m) => m.id === id)?.display_name ?? 'them');
  const mark = (p: { memberId: string; ruleId: string }, el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    setAsk(null);
    start(async () => {
      const r = await quickDoneFor(objectId, [p.ruleId]);
      if (!r.ok) { toast.show(r.error); return; }
      celebrate({ at: { x: box.left + box.width / 2, y: box.top },
        undo: { eventId: r.eventIds!, objectId, waiting: !!r.waiting, label: `Done for ${name(p.memberId)}.` } });
    });
  };
  const done = parts.filter((p) => p.done).length;
  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="avatars">
        {parts.map((p) => {
          const m = members.find((x) => x.id === p.memberId);
          const asking = ask === p.memberId;
          return (
            <button key={p.memberId} type="button" disabled={p.done || busy}
              className={`avatar avatar-btn pc-${colorOf(members, p.memberId)}${p.done ? ' avatar-done' : ''}${asking ? ' avatar-asking' : ''}`}
              aria-label={p.done ? `${m?.display_name}: done` : `Mark ${m?.display_name}’s part done`}
              onClick={(e) => (asking ? mark(p, e.currentTarget) : setAsk(p.memberId))}>
              {asking ? '✓' : m?.display_name[0]}
            </button>
          );
        })}
      </span>
      <span className="small">{ask ? `Tap again: done for ${name(ask)}` : `${done} of ${parts.length} done`}</span>
      {toast.node}
    </span>
  );
}
