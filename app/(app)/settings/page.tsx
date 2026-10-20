import { headers } from 'next/headers';
import Link from '@/components/link';
import { FamilyTablet } from '@/components/family-tablet';
import { CalendarLink, PushToggle } from '@/components/reminder-settings';
import { getMe } from '@/lib/auth';

export const metadata = { title: 'Settings · Stonebook' };

export default async function Settings() {
  const { supabase, me } = await getMe();
  const [{ data: link }, { data: phones }, { data: publicKey }, { data: pins }, { data: kids }] = await Promise.all([
    supabase.from('calendar_links').select('token').eq('member_id', me.id).maybeSingle(),
    supabase.from('push_subscriptions').select('device, created_at').order('created_at'),
    supabase.rpc('push_public_key'),
    supabase.rpc('pins_set'),
    supabase.from('members').select('id, display_name').eq('role', 'child'),
  ]);
  const pinSet = new Set(((pins ?? []) as unknown as string[]).map(String));
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;

  return (
    <main className="page">
      <Link href="/family" className="btn btn-text" style={{ alignSelf: 'flex-start', padding: 0 }}>Back to Family</Link>
      <h1>Settings</h1>
      {me.role === 'child' ? <p>Mum or Dad get your reminders.</p> : (
        <>
          <PushToggle publicKey={(publicKey as string | null) ?? null} />
          {(phones ?? []).length > 0 && (
            <p className="small" style={{ margin: 0 }}>
              Getting reminders: {(phones ?? []).map((p) => p.device ?? 'a phone').join(', ')}.
            </p>
          )}
          <CalendarLink url={link ? `${origin}/cal/${link.token}.ics` : null} />
          <Link href="/settings/whats-new" className="card card-link">
            <span className="item-title">What’s new</span>
            <span className="small">Every change to Stonebook, newest first.</span>
          </Link>
          {me.role === 'parent' && (
            <Link href="/settings/kinds" className="card card-link">
              <span className="item-title">Kinds of things</span>
              <span className="small">Add a new kind, like Cabin or Bike, and choose the details each one has.</span>
            </Link>
          )}
          {me.role === 'parent' && (
            <FamilyTablet meId={me.id} mePinSet={pinSet.has(me.id)}
              kids={(kids ?? []).map((k) => ({ id: k.id, name: k.display_name, pinSet: pinSet.has(k.id) }))} />
          )}
        </>
      )}
    </main>
  );
}
