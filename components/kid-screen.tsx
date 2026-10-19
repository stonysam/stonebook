'use client';

import { useCallback, useState, useTransition } from 'react';
import { exitKidMode, kidDone } from '@/app/actions';
import { ChoreIcon } from './chore-icons';
import { Fireworks } from './fireworks';

export interface KidTile { ruleId: string; objectId: string; name: string; picture: string | null; state: 'todo' | 'waiting' | 'done' }

/** A big number pad: four dots, digits, delete. Calls onDone with the 4 digits. */
function PinPad({ title, error, busy, onDone, onClose }: {
  title: string; error: string | null; busy: boolean; onDone: (pin: string) => void; onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) { onDone(next); setTimeout(() => setPin(''), 300); }
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet kid-pad" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ textAlign: 'center', fontSize: 26 }}>{title}</h2>
        <div className="kid-dots" aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
        </div>
        {error && <p role="alert" style={{ margin: 0, textAlign: 'center', fontWeight: 700, fontSize: 18 }}>{error}</p>}
        <div className="kid-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} disabled={busy}>{d}</button>
          ))}
          <button type="button" onClick={onClose} className="kid-key-text">Back</button>
          <button type="button" onClick={() => press('0')} disabled={busy}>0</button>
          <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="kid-key-text" aria-label="Delete">Delete</button>
        </div>
      </div>
    </div>
  );
}

export function KidScreen({ childId, name, tiles, stars }: { childId: string; name: string; tiles: KidTile[]; stars: number }) {
  const [asking, setAsking] = useState<KidTile | 'grown-up' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const endCheer = useCallback(() => setCheer(null), []);
  const todo = tiles.filter((t) => t.state === 'todo').length;

  const submit = (pin: string) => start(async () => {
    setError(null);
    if (asking === 'grown-up') {
      const r = await exitKidMode(pin);
      if (r && !r.ok) setError(r.error);
      return;
    }
    if (!asking) return;
    const r = await kidDone({ childId, objectId: asking.objectId, ruleId: asking.ruleId, pin });
    if (!r.ok) { setError(r.error); return; }
    setAsking(null);
    setCheer(`Nice one, ${name}!`);
  });

  return (
    <main className="kid">
      <header className="kid-head">
        <h1>Hi {name}!</h1>
        <p>{todo === 0 ? 'All done for today. Brilliant!' : todo === 1 ? 'One thing to do today.' : `${todo} things to do today.`}</p>
      </header>

      <section className="kid-stars" aria-label={`${stars} stars this week`}>
        <span className="kid-stars-label">This week</span>
        <span className="kid-stars-row">
          {stars === 0 ? <span className="muted">Your stars will show here</span>
            : Array.from({ length: Math.min(stars, 21) }, (_, i) => <ChoreIcon key={i} name="star" size={34} filled />)}
          {stars > 21 && <strong>+{stars - 21}</strong>}
        </span>
      </section>

      <section className="kid-grid" aria-label="Today's chores">
        {tiles.map((t) => (
          <div key={t.ruleId} className={`kid-tile ${t.state}`}>
            <ChoreIcon name={t.picture} size={72} />
            <span className="kid-name">{t.name}</span>
            {t.state === 'todo' && (
              <button type="button" className="kid-done" onClick={() => { setError(null); setAsking(t); }}>I did it</button>
            )}
            {t.state === 'waiting' && <span className="kid-badge">Mum or Dad will check</span>}
            {t.state === 'done' && <span className="kid-badge done">Done!</span>}
          </div>
        ))}
        {tiles.length === 0 && <div className="kid-tile done"><ChoreIcon name="star" size={72} filled /><span className="kid-name">Nothing to do today</span></div>}
      </section>

      <button type="button" className="kid-grownups" onClick={() => { setError(null); setAsking('grown-up'); }}>Grown-ups</button>

      {asking && (
        <PinPad
          title={asking === 'grown-up' ? 'Grown-up PIN' : `Your PIN, ${name}`}
          error={error} busy={busy} onDone={submit} onClose={() => setAsking(null)}
        />
      )}
      {cheer && <Fireworks message={cheer} onDone={endCheer} />}
    </main>
  );
}
