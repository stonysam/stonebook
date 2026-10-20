'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { markFeedSeen, toggleReaction } from '@/app/actions';
import Link from './link';

const REACTIONS: [string, string, string][] = [
  ['clap', '\u{1F44F}', 'Clap'], ['fire', '\u{1F525}', 'Fire'], ['heart', '\u{2764}\u{FE0F}', 'Heart'],
  ['star', '\u{2B50}', 'Star'], ['muscle', '\u{1F4AA}', 'Strong'], ['wolf', '\u{1F43A}', 'Wolf'],
];

type Reaction = { emoji: string; mine: boolean; who: string };

export function MarkSeen() {
  useEffect(() => { void markFeedSeen(); }, []);
  return null;
}

export function FeedItem({ rootId, href, who, initial, title, line, reactions, canReact }: {
  rootId: string; href: string; who: string; initial: string; title: string; line: string; reactions: Reaction[]; canReact: boolean;
}) {
  const [optimistic, apply] = useOptimistic(reactions, (cur: Reaction[], change: { emoji: string; on: boolean }) =>
    change.on ? [...cur, { emoji: change.emoji, mine: true, who: 'You' }] : cur.filter((r) => !(r.mine && r.emoji === change.emoji)));
  const [tray, setTray] = useState(false);
  const [, start] = useTransition();

  const toggle = (emoji: string) => {
    const on = !optimistic.some((r) => r.mine && r.emoji === emoji);
    setTray(false);
    start(async () => { apply({ emoji, on }); await toggleReaction(rootId, emoji, on); });
  };

  const counts = REACTIONS.map(([key, glyph, label]) => {
    const list = optimistic.filter((r) => r.emoji === key);
    return { key, glyph, label, n: list.length, mine: list.some((r) => r.mine), names: list.map((r) => r.who).join(', ') };
  }).filter((c) => c.n > 0);

  return (
    <article className="card stack" style={{ gap: 12 }}>
      <Link href={href} className="row feed-link" style={{ alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 20, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{initial}</span>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div><strong>{who}</strong>: {title}</div>
          <div className="small">{line}</div>
        </div>
        <span aria-hidden="true" className="muted" style={{ alignSelf: 'center', fontSize: 20 }}>›</span>
      </Link>
      <div className="wrap">
        {counts.map((c) => (
          <button key={c.key} type="button" className="chip" aria-pressed={c.mine} disabled={!canReact} onClick={() => toggle(c.key)}
            aria-label={`${c.label}, ${c.n}: ${c.names}`} title={c.names} style={{ padding: '0 12px' }}>
            <span aria-hidden="true">{c.glyph}</span>&nbsp;{c.n}
          </button>
        ))}
        {canReact && (
          <button type="button" className="chip" aria-expanded={tray} onClick={() => setTray(!tray)} style={{ padding: '0 12px' }}>
            {tray ? 'Close' : 'React'}
          </button>
        )}
      </div>
      {tray && (
        <div className="wrap" style={{ padding: 8, borderRadius: 12, background: 'var(--surface-2)' }}>
          {REACTIONS.map(([key, glyph, label]) => (
            <button key={key} type="button" className="chip" aria-label={label} aria-pressed={optimistic.some((r) => r.mine && r.emoji === key)}
              onClick={() => toggle(key)} style={{ fontSize: 22, padding: '0 12px' }}>
              {glyph}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
