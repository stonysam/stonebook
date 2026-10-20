import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { NOTES, unseenNotes } from '@/lib/whats-new';

describe('what’s new', () => {
  it('shows each note once, only to people who were here when it shipped', () => {
    const first = NOTES.at(-1)!;
    expect(unseenNotes('member', '2026-10-01T00:00:00Z', []).map((n) => n.id)).toContain(first.id);
    expect(unseenNotes('member', '2026-10-01T00:00:00Z', [first.id]).map((n) => n.id)).not.toContain(first.id);
    expect(unseenNotes('member', '2099-01-01T00:00:00Z', [])).toEqual([]);
  });

  it('notes have unique ids and their screenshots exist', () => {
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
    for (const n of NOTES) {
      expect(n.id).toMatch(/^[a-z0-9-]{3,60}$/);
      if (n.image) expect(existsSync(`public${n.image.src}`)).toBe(true);
    }
  });
});
