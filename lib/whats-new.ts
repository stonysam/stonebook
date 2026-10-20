// "What's new" notes, newest first. Add one per release that people would notice; leave out
// small fixes. Screenshots go in public/whats-new/ and must use sample data only: anything in
// public/ can be opened by anyone with the link.
import type { MemberRole } from '@/lib/database.types';

export interface Note {
  /** Stable id, never reused: date plus a few words. */
  id: string;
  /** The day it went live (YYYY-MM-DD). People who joined later don't get it. */
  date: string;
  title: string;
  intro: string;
  points?: string[];
  image?: { src: string; alt: string };
  /** Where "Show me" goes. */
  href?: string;
  /** Who it's for: everyone with a login, or parents only. */
  audience: 'everyone' | 'parents';
}

export const NOTES: Note[] = [
  {
    id: '2026-10-21-icons-and-tidy-ups',
    date: '2026-10-21',
    title: 'Icons, and a few tidy-ups',
    intro: 'Small changes from your feedback this week:',
    points: [
      'The Add page has an icon for each kind of thing.',
      'Tap anything in the Family feed to open it.',
      'Activities don’t need a start time, and have a Description instead of Contact.',
      '“Personal” now simply means you plus Mum and Dad. Pick Shared for the whole family.',
    ],
    image: { src: '/whats-new/2026-10-21-add-icons.webp', alt: 'The Add page with an icon on each button' },
    href: '/add',
    audience: 'everyone',
  },
];

export function notesFor(role: MemberRole): Note[] {
  return NOTES.filter((n) => n.audience === 'everyone' || role === 'parent');
}

/** Notes this person hasn't seen yet, oldest first, leaving out ones from before they joined. */
export function unseenNotes(role: MemberRole, joinedAt: string, seen: string[]): Note[] {
  const joined = joinedAt.slice(0, 10);
  return notesFor(role).filter((n) => n.date >= joined && !seen.includes(n.id)).reverse();
}
