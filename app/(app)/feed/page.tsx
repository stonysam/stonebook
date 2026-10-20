import { FeedItem, MarkSeen } from '@/components/feed-item';
import { getMe } from '@/lib/auth';
import { timeAgo } from '@/lib/format';

export const metadata = { title: 'Family feed · Stonebook' };

export default async function Feed() {
  const { supabase, me } = await getMe();
  const [{ data: feed }, { data: members }, { data: seen }] = await Promise.all([
    supabase.from('family_feed').select('*').order('announced_at', { ascending: false }).limit(60),
    supabase.from('members').select('id, display_name'),
    supabase.from('feed_seen').select('seen_at').eq('member_id', me.id).maybeSingle(),
  ]);
  const name = (id: string | null) => (id === me.id ? 'You' : members?.find((m) => m.id === id)?.display_name ?? 'Someone');
  const since = seen?.seen_at ?? '1970-01-01';
  const items = feed ?? [];
  const firstOld = items.findIndex((f) => f.announced_at <= since);

  return (
    <main className="page">
      <header>
        <h1>Family feed</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>What got done on the family&apos;s shared things</p>
      </header>
      <MarkSeen />
      {items.map((f, i) => (
        <div key={f.id} className="stack">
          {i === firstOld && i > 0 && <div className="small" style={{ textAlign: 'center' }}>Seen before</div>}
          <FeedItem
            rootId={f.id}
            href={`/things/${f.object_id}`}
            who={name(f.created_by)}
            initial={name(f.created_by)[0]}
            title={f.object_name}
            line={`${f.kind}${f.note ? ` · ${f.note}` : ''} · ${timeAgo(f.announced_at)}`}
            reactions={(f.reactions ?? []).map((r) => ({ emoji: r.emoji, mine: r.member_id === me.id, who: name(r.member_id) }))}
            canReact={me.role !== 'child'}
          />
        </div>
      ))}
      {items.length === 0 && (
        <div className="card dashed" style={{ textAlign: 'center', padding: 32 }}>
          When someone finishes something on a shared thing, it shows up here for everyone to cheer.
        </div>
      )}
    </main>
  );
}
