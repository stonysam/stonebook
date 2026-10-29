'use client';

import { useState } from 'react';

export interface PickableItem { id: string; name: string; kind: string; group: boolean; partOf?: string | null }

/** Type a few letters to find an item (one animal or a whole group); the pick is posted as `name`. */
export function ItemPicker({ items, name, label, initial }: { items: PickableItem[]; name: string; label: string; initial?: string | null }) {
  const [chosen, setChosen] = useState<PickableItem | null>(items.find((i) => i.id === initial) ?? null);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const matches = query ? items.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 8) : [];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="hidden" name={name} value={chosen?.id ?? ''} />
      {chosen ? (
        <div className="card row" style={{ gap: 8, padding: '10px 12px' }}>
          <div className="stack" style={{ gap: 2, flex: '1 1 auto' }}>
            <span className="item-title">{chosen.name}</span>
            <span className="small">{chosen.kind}{chosen.group ? ' · group' : ''}{chosen.partOf ? ` · in ${chosen.partOf}` : ''}</span>
          </div>
          <button type="button" className="btn btn-text" onClick={() => { setChosen(null); setQ(''); }}>Change</button>
        </div>
      ) : (
        <>
          <label className="field">{label}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing, e.g. hens or Clyde" autoComplete="off" />
          </label>
          {matches.length > 0 && (
            <div className="list" role="listbox" aria-label="Matching items">
              {matches.map((i) => (
                <button key={i.id} type="button" role="option" aria-selected={false} className="list-item item-pick" onClick={() => setChosen(i)}>
                  <span className="item-title">{i.name}</span>
                  <span className="small">{i.kind}{i.group ? ' · group' : ''}{i.partOf ? ` · in ${i.partOf}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {query && matches.length === 0 && <span className="small">Nothing called that. Add it from the Log first.</span>}
        </>
      )}
    </div>
  );
}
