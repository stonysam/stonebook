'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { markFeedSeen, toggleReaction } from '@/app/actions';
import Link from './link';
import { KindIcon } from './kind-icon';

const REACTIONS: [string, string, string][] = [
  ['clap', '\u{1F44F}', 'Clap'], ['fire', '\u{1F525}', 'Fire'], ['heart', '\u{2764}\u{FE0F}', 'Heart'],
  ['star', '\u{2B50}', 'Star'], ['muscle', '\u{1F4AA}', 'Strong'], ['wolf', '\u{1F43A}', 'Wolf'],
];

type Reaction = { emoji: string; mine: boolean; who: string };

export function MarkSeen() {
  useEffect(() => { void markFeedSeen(); }, []);
  return null;
}

export function FeedItem({ rootId, href, who, color, initial, title, kind, note, when, icon, isNew, reactions, canReact }: {
  rootId: string; href: string; who: string; color: string; initial: string; title: string; kind: string; note: string | null;
  when: string; icon: string | null; isNew: boolean; reactions: Reaction[]; canReact: boolean;
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
    <article className={`card stack stripe pc-${color} feed-card`} style={{ gap: 12 }}>
      <Link href={href} className="row feed-link" style={{ alignItems: 'flex-start', gap: 12, textDecoration: 'none', color: 'inherit' }}>
        <span className={`avatar pc-${color}`} style={{ width: 44, height: 44, fontSize: 20, flexShrink: 0 }} aria-hidden="true">{initial}</span>
        <div className="stack" style={{ gap: 4, flex: '1 1 auto', minWidth: 0 }}>
          <div className="small" style={{ fontWeight: 600 }}>{who}{isNew && <span className="feed-new">New</span>}</div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ display: 'inline-flex' }}><KindIcon name={icon} size={20} /></span>
            <span className="item-title" style={{ minWidth: 0 }}>{title}</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-done">{kind}</span>
            <span className="small">{when}</span>
          </div>
          {note && <div className="feed-note">{note}</div>}
        </div>
        <span aria-hidden="true" className="muted" style={{ alignSelf: 'center', fontSize: 22 }}>›</span>
      </Link>
      <div className="wrap">
        {counts.map((c) => (
          <button key={c.key} type="button" className="chip" aria-pressed={c.mine} disabled={!canReact} onClick={() => toggle(c.key)}
            aria-label={`${c.label}, ${c.n}: ${c.names}`} title={c.names} style={{ padding: '0 12px', minHeight: 36 }}>
            <span aria-hidden="true">{c.glyph}</span>&nbsp;{c.n}
          </button>
        ))}
        {canReact && (
          <button type="button" className="chip" aria-expanded={tray} onClick={() => setTray(!tray)} style={{ padding: '0 12px', minHeight: 36 }}>
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
