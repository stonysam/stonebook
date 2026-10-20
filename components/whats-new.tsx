'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markNotesSeen } from '@/app/actions';
import type { Note } from '@/lib/whats-new';

export function NoteBody({ note }: { note: Note }) {
  return (
    <>
      {note.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={note.image.src} alt={note.image.alt} className="note-shot" />
      )}
      <p style={{ margin: 0 }}>{note.intro}</p>
      {note.points && <ul className="note-points">{note.points.map((p) => <li key={p}>{p}</li>)}</ul>}
    </>
  );
}

/** Shows notes about new features once, after someone opens the app following a release. */
export function WhatsNew({ notes }: { notes: Note[] }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(notes.length > 0);
  const router = useRouter();
  if (!open || notes.length === 0) return null;
  const note = notes[i];
  const last = i === notes.length - 1;
  const close = () => { setOpen(false); void markNotesSeen(notes.map((n) => n.id)); };
  const showMe = () => { close(); if (note.href) router.push(note.href); };

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="row">
          <span className="small" style={{ fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>New in Stonebook</span>
          <span className="spacer" />
          {notes.length > 1 && <span className="small">{i + 1} of {notes.length}</span>}
        </div>
        <h2 id="whats-new-title" style={{ margin: 0 }}>{note.title}</h2>
        <NoteBody note={note} />
        <div className="row note-actions" style={{ gap: 8 }}>
          {note.href && <button type="button" className="btn" style={{ flex: '1 1 0' }} onClick={showMe}>Show me</button>}
          {last
            ? <button type="button" className="btn btn-primary" style={{ flex: '1 1 0' }} onClick={close}>Got it</button>
            : <button type="button" className="btn btn-primary" style={{ flex: '1 1 0' }} onClick={() => setI(i + 1)}>Next</button>}
        </div>
      </section>
    </div>
  );
}
