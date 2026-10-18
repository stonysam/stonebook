'use client';

import { useEffect } from 'react';

const BURSTS: [string, string, string, number][] = [
  ['22%', '22%', '#F3C25A', 0], ['74%', '16%', '#9BE07F', 0.35], ['50%', '32%', '#F6EFDC', 0.7], ['30%', '13%', '#F4936A', 1.0],
];
const SPARKS = [...Array.from({ length: 16 }, (_, i) => `sp a${i}`), ...Array.from({ length: 8 }, (_, i) => `sp b${i}`)];

export function Fireworks({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fw" aria-hidden="true">
      <div className="fw-dim" />
      {BURSTS.map(([left, top, color, delay]) => (
        <div key={left + top} className="fw-b" style={{ left, top }}>
          <span className="fw-rocket" style={{ background: color, animationDelay: `${delay}s` }} />
          {SPARKS.map((cls) => (
            <span key={cls} className={cls} style={{ background: color, boxShadow: `0 0 10px 2px ${color}`, animationDelay: `${delay + 0.5}s` }} />
          ))}
        </div>
      ))}
      <div className="fw-msg">{message}</div>
    </div>
  );
}
