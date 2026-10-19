'use client';

import { useEffect, useMemo } from 'react';

const COLORS = ['#d8576f', '#e7869a', '#c99a3b', '#f0b4c0', '#b04660'];

/** Hearts floating up from the bottom of the screen, with an optional message. About 2.4 seconds. */
export function Hearts({ message, onDone }: { message?: string | null; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  const hearts = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: 4 + ((i * 53) % 92), size: 18 + ((i * 7) % 22), delay: ((i * 37) % 70) / 100, drift: ((i % 5) - 2) * 14,
    color: COLORS[i % COLORS.length], dur: 1.7 + ((i * 13) % 6) / 10,
  })), []);
  return (
    <div className="hearts" aria-hidden="true">
      {hearts.map((h, i) => (
        <svg key={i} className="heart" viewBox="0 0 24 22" width={h.size} height={h.size}
          style={{ left: `${h.left}%`, animationDelay: `${h.delay}s`, animationDuration: `${h.dur}s`, ['--drift' as string]: `${h.drift}px`, color: h.color }}>
          <path fill="currentColor" d="M12 21s-8.5-5.2-10.6-10.2C-.1 6.3 3 1.5 7.2 2.1 9.4 2.4 11 4 12 5.6 13 4 14.6 2.4 16.8 2.1 21 1.5 24.1 6.3 22.6 10.8 20.5 15.8 12 21 12 21z" />
        </svg>
      ))}
      {message && <div className="hearts-msg">{message}</div>}
    </div>
  );
}
