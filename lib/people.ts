import type { MemberRow, PersonColor } from './database.types';

// Person colours: Crystal's six (21 Oct 2026) plus two spares. The keys are stored in members.color;
// the actual colours live in app/theme.css (.pc-<key>).
export const PALETTE: { key: PersonColor; label: string }[] = [
  { key: 'sky', label: 'Blue' }, { key: 'moss', label: 'Green' }, { key: 'clay', label: 'Pink' }, { key: 'hay', label: 'Yellow' },
  { key: 'plum', label: 'Purple' }, { key: 'rose', label: 'Red' }, { key: 'slate', label: 'Slate' }, { key: 'teal', label: 'Teal' },
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
