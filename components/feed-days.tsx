'use client';

import { useState, useTransition } from 'react';
import { setFeedDays } from '@/app/actions';
import { useToast } from './toast';

/** "Keep things in my Feed for xx days." Each person sets their own. */
export function FeedDays({ initial }: { initial: number }) {
  const [days, setDays] = useState(String(initial));
  const [busy, start] = useTransition();
  const toast = useToast();
  const changed = Number(days) !== initial;
  return (
    <form className="card stack" style={{ gap: 10 }} onSubmit={(e) => {
      e.preventDefault();
      start(async () => { const r = await setFeedDays(Number(days)); toast.show(r.ok ? (r.message ?? 'Saved.') : r.error); });
    }}>
      <span className="item-title">Family feed</span>
      <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span>Keep things in my Feed for</span>
        <input type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 84 }} aria-label="Days" />
        <span>days</span>
      </label>
      <span className="small">Done ticks and logged entries leave your Feed after this. Their history stays in the Log.</span>
      {changed && <button className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save'}</button>}
      {toast.node}
    </form>
  );
}
