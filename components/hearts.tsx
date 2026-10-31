'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { undoDone } from '@/app/actions';
import { useToast } from './toast';

const COLORS = ['#e0405e', '#f06a85', '#d8576f', '#ff8fa6', '#c2304f', '#e8b131'];
const LENGTH = 8200; // ms, until the last heart has left the top of the screen

/** Three hearts rising slowly from the button that was tapped. */
function ButtonHearts({ at, onDone }: { at: { x: number; y: number }; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  const hearts = [{ dx: -16, delay: 0, size: 26, color: '#e0405e', drift: -14 }, { dx: 6, delay: 0.3, size: 32, color: '#f06a85', drift: 10 },
    { dx: -4, delay: 0.6, size: 24, color: '#c2304f', drift: -4 }];
  return (
    <div className="hearts" aria-hidden="true">
      {hearts.map((h, i) => (
        <svg key={i} className="heart-pop" viewBox="0 0 24 22" width={h.size} height={h.size}
          style={{ left: at.x + h.dx - h.size / 2, top: at.y - h.size / 2, animationDelay: `${h.delay}s`, color: h.color, ['--drift' as string]: `${h.drift}px` }}>
          <path fill="currentColor" stroke="#fff" strokeWidth="1.2" d="M12 21s-8.5-5.2-10.6-10.2C-.1 6.3 3 1.5 7.2 2.1 9.4 2.4 11 4 12 5.6 13 4 14.6 2.4 16.8 2.1 21 1.5 24.1 6.3 22.6 10.8 20.5 15.8 12 21 12 21z" />
        </svg>
      ))}
    </div>
  );
}

/** Hearts floating from the bottom of the screen all the way off the top, with an optional message (kids' cheers). */
export function Hearts({ message, onDone }: { message?: string | null; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, LENGTH);
    return () => clearTimeout(t);
  }, [onDone]);
  const hearts = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    left: 2 + ((i * 37) % 94), size: 34 + ((i * 11) % 34), delay: ((i * 29) % 190) / 100,
    drift: ((i % 7) - 3) * 18, spin: ((i % 5) - 2) * 8, color: COLORS[i % COLORS.length], dur: 4.8 + ((i * 7) % 13) / 10,
  })), []);
  return (
    <div className="hearts" aria-hidden="true">
      {hearts.map((h, i) => (
        <svg key={i} className="heart" viewBox="0 0 24 22" width={h.size} height={h.size}
          style={{ left: `${h.left}%`, animationDelay: `${h.delay}s`, animationDuration: `${h.dur}s`, color: h.color,
            ['--drift' as string]: `${h.drift}px`, ['--spin' as string]: `${h.spin}deg` }}>
          <path fill="currentColor" stroke="#fff" strokeWidth="1.2" d="M12 21s-8.5-5.2-10.6-10.2C-.1 6.3 3 1.5 7.2 2.1 9.4 2.4 11 4 12 5.6 13 4 14.6 2.4 16.8 2.1 21 1.5 24.1 6.3 22.6 10.8 20.5 15.8 12 21 12 21z" />
        </svg>
      ))}
      {message && <div className="hearts-msg">{message}</div>}
    </div>
  );
}

// The Done button disappears as soon as its task is done, so the hearts and the Undo offer
// live here, once per page (app layout), and buttons ask for them with an event.
type Celebrate = {
  message?: string | null;
  /** Where the Done button is: three hearts rise from it instead of the full-screen shower. */
  at?: { x: number; y: number };
  undo?: { eventId: string | string[]; objectId: string; waiting: boolean; label?: string };
};
const EVENT = 'stonebook:celebrate';

export function celebrate(detail: Celebrate) {
  window.dispatchEvent(new CustomEvent<Celebrate>(EVENT, { detail }));
}

export function CelebrationHost() {
  const [hearts, setHearts] = useState<{ key: number; message: string | null; at?: { x: number; y: number } } | null>(null);
  const [undo, setUndo] = useState<Celebrate['undo'] | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const end = useCallback(() => setHearts(null), []);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Celebrate>).detail;
      setHearts({ key: Date.now(), message: d.message ?? null, at: d.at });
      setUndo(d.undo ?? null);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  return (
    <>
      {hearts && (hearts.at
        ? <ButtonHearts key={hearts.key} at={hearts.at} onDone={end} />
        : <Hearts key={hearts.key} message={hearts.message} onDone={end} />)}
      {undo && (
        <div className="toast row" role="status">
          <span style={{ flex: '1 1 auto' }}>{undo.waiting ? 'Done. Mum or Dad will check it.' : (undo.label ?? 'Done.')}</span>
          <button type="button" className="btn btn-text" style={{ color: 'var(--bg)', minHeight: 32 }}
            onClick={() => start(async () => { const u = undo; setUndo(null); const r = await undoDone(u.eventId, u.objectId); toast.show(r.ok ? 'Undone.' : r.error); })}>
            Undo
          </button>
        </div>
      )}
      {toast.node}
    </>
  );
}
