import { headers } from 'next/headers';
import Link from '@/components/link';
import { CalendarLink, PushToggle } from '@/components/reminder-settings';
import { getMe } from '@/lib/auth';

export const metadata = { title: 'Reminders and calendar · Stonebook' };

export default async function Settings() {
  const { supabase, me } = await getMe();
  const [{ data: link }, { data: phones }, { data: publicKey }] = await Promise.all([
    supabase.from('calendar_links').select('token').eq('member_id', me.id).maybeSingle(),
    supabase.from('push_subscriptions').select('device, created_at').order('created_at'),
    supabase.rpc('push_public_key'),
  ]);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;

  return (
    <main className="page">
      <Link href="/family" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Family</Link>
      <h1>Reminders and calendar</h1>
      {me.role === 'child' ? <p>Mum or Dad get your reminders.</p> : (
        <>
          <PushToggle publicKey={(publicKey as string | null) ?? null} />
          {(phones ?? []).length > 0 && (
            <p className="small" style={{ margin: 0 }}>
              Getting reminders: {(phones ?? []).map((p) => p.device ?? 'a phone').join(', ')}.
            </p>
          )}
          <CalendarLink url={link ? `${origin}/cal/${link.token}.ics` : null} />
        </>
      )}
    </main>
  );
}
