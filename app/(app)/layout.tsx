import { Nav } from '@/components/nav';
import { getMe } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await getMe();
  const [{ data: seen }, { data: feed }] = await Promise.all([
    supabase.from('feed_seen').select('seen_at').eq('member_id', me.id).maybeSingle(),
    supabase.from('family_feed').select('announced_at, created_by').order('announced_at', { ascending: false }).limit(50),
  ]);
  const since = seen?.seen_at ?? '1970-01-01';
  const feedCount = (feed ?? []).filter((f) => f.announced_at > since && f.created_by !== me.id).length;

  return (
    <div className="shell">
      {children}
      <Nav feedCount={feedCount} showFamily />
    </div>
  );
}
