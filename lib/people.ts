import type { MemberRow, PersonColor } from './database.types';

// Person colours: a fixed set chosen to sit with the farm green, oat and hay palette.
// Every one carries white lettering at 4.5:1 or better.
export const PALETTE: { key: PersonColor; label: string }[] = [
  { key: 'moss', label: 'Moss' }, { key: 'sky', label: 'Sky' }, { key: 'clay', label: 'Clay' }, { key: 'plum', label: 'Plum' },
  { key: 'hay', label: 'Hay' }, { key: 'slate', label: 'Slate' }, { key: 'rose', label: 'Rose' }, { key: 'teal', label: 'Teal' },
];

/** A person's colour: their chosen one, or a different default for each person until a parent picks. */
export function colorOf(members: MemberRow[], id: string | null | undefined): PersonColor {
  const m = members.find((x) => x.id === id);
  if (m?.color) return m.color;
  const taken = new Set(members.map((x) => x.color).filter(Boolean));
  const free = PALETTE.map((p) => p.key).filter((k) => !taken.has(k));
  const unset = members.filter((x) => !x.color);
  const i = Math.max(0, unset.findIndex((x) => x.id === id));
  return (free.length ? free : PALETTE.map((p) => p.key))[i % (free.length || PALETTE.length)];
}
