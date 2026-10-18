'use client';

import { useTransition } from 'react';
import { decide } from '@/app/actions';
import { useToast } from './toast';

export function DecideButtons({ eventId, who }: { eventId: string; who: string }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  const go = (approved: boolean) => start(async () => {
    const r = await decide(eventId, approved);
    toast.show(r.ok ? (approved ? `${who}’s chore counts now, and it’s in the family feed.` : `Sent back to ${who} as not done yet.`) : r.error);
  });
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn btn-primary" style={{ flex: '1 1 0' }} disabled={busy} onClick={() => go(true)}>Yes, done</button>
      <button className="btn" style={{ flex: '1 1 0' }} disabled={busy} onClick={() => go(false)}>Not done yet</button>
      {toast.node}
    </div>
  );
}
