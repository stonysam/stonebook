import type { MemberRow } from '@/lib/database.types';
import { colorOf } from '@/lib/people';

/** A person's initial on their colour. */
export function Avatar({ members, id, size = 28, title }: { members: MemberRow[]; id: string | null | undefined; size?: number; title?: string }) {
  const m = members.find((x) => x.id === id);
  return (
    <span className={`avatar pc-${colorOf(members, id)}`} title={title ?? m?.display_name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }} aria-hidden={title ? undefined : true}>
      {m?.display_name[0] ?? '?'}
    </span>
  );
}

/** Several avatars overlapping a little, for group tasks and activities. */
export function Avatars({ members, ids, size = 24, done = [] }: { members: MemberRow[]; ids: string[]; size?: number; done?: string[] }) {
  return (
    <span className="avatars" aria-label={ids.map((id) => members.find((m) => m.id === id)?.display_name).join(', ')}>
      {ids.map((id) => (
        <span key={id} className={done.includes(id) ? 'avatar-done' : undefined}><Avatar members={members} id={id} size={size} /></span>
      ))}
    </span>
  );
}
