import { Nav } from '@/components/nav';
import { getMe } from '@/lib/auth';
import { WhatsNew } from '@/components/whats-new';
import { CelebrationHost } from '@/components/hearts';
import { unseenNotes } from '@/lib/whats-new';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await getMe();
  const [{ data: seen }, { data: feed }, { data: notesSeen }] = await Promise.all([
    supabase.from('feed_seen').select('seen_at').eq('member_id', me.id).maybeSingle(),
    supabase.from('family_feed').select('announced_at, created_by').order('announced_at', { ascending: false }).limit(50),
    supabase.from('whats_new_seen').select('note_id'),
  ]);
  // If the table can't be read, show nothing rather than the same note on every visit.
  const notes = notesSeen ? unseenNotes(me.role, me.created_at, notesSeen.map((n) => n.note_id)) : [];
  const since = seen?.seen_at ?? '1970-01-01';
  const feedCount = (feed ?? []).filter((f) => f.announced_at > since && f.created_by !== me.id).length;

  return (
    <div className="shell">
      {children}
      <Nav feedCount={feedCount} showFamily />
      <WhatsNew notes={notes} />
      <CelebrationHost />
    </div>
  );
}
