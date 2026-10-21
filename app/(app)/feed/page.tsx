import { FeedItem, MarkSeen } from '@/components/feed-item';
import { getMe } from '@/lib/auth';
import { dayLabel, timeAgo } from '@/lib/format';
import { colorOf } from '@/lib/people';
import type { MemberRow } from '@/lib/database.types';
import { addDays, todayIn } from '@/src/engine/dates';

export const metadata = { title: 'Family feed · Stonebook' };

export default async function Feed() {
  const { supabase, me } = await getMe();
  const [{ data: feed }, { data: members }, { data: seen }, { data: objects }, { data: types }] = await Promise.all([
    supabase.from('family_feed').select('*').order('announced_at', { ascending: false }).limit(60),
    supabase.from('members').select('*'),
    supabase.from('feed_seen').select('seen_at').eq('member_id', me.id).maybeSingle(),
    supabase.from('objects').select('id, object_type_id'),
    supabase.from('object_types').select('id, icon'),
  ]);
  const people = (members ?? []) as MemberRow[];
  const name = (id: string | null) => (id === me.id ? 'You' : people.find((m) => m.id === id)?.display_name ?? 'Someone');
  const iconOf = (objectId: string) => {
    const typeId = objects?.find((o) => o.id === objectId)?.object_type_id;
    return types?.find((t) => t.id === typeId)?.icon ?? null;
  };
  const since = seen?.seen_at ?? '1970-01-01';
  const items = feed ?? [];
  const today = todayIn('Europe/Prague');
  const dayOf = (ts: string) => todayIn('Europe/Prague', new Date(ts));
  const heading = (day: string) => (day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : dayLabel(day, today));

  return (
    <main className="page">
      <header>
        <h1>Family feed</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>What got done on the family&apos;s shared things</p>
      </header>
      <MarkSeen />
      {items.map((f, i) => {
        const day = dayOf(f.announced_at);
        const newDay = i === 0 || dayOf(items[i - 1].announced_at) !== day;
        return (
          <div key={f.id} className="stack" style={{ gap: 10 }}>
            {newDay && <h2 className="eyebrow" style={{ marginTop: i === 0 ? 0 : 8 }}>{heading(day)}</h2>}
            <FeedItem
              rootId={f.id}
              href={`/things/${f.object_id}`}
              who={name(f.created_by)}
              color={colorOf(people, f.created_by)}
              initial={(people.find((m) => m.id === f.created_by)?.display_name ?? '?')[0]}
              title={f.object_name}
              kind={f.kind}
              note={f.note}
              when={timeAgo(f.announced_at)}
              icon={iconOf(f.object_id)}
              isNew={f.announced_at > since && f.created_by !== me.id}
              reactions={(f.reactions ?? []).map((r) => ({ emoji: r.emoji, mine: r.member_id === me.id, who: name(r.member_id) }))}
              canReact={me.role !== 'child'}
            />
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="card dashed" style={{ textAlign: 'center', padding: 32 }}>
          When someone finishes something on a shared thing, it shows up here for everyone to cheer.
        </div>
      )}
    </main>
  );
}
