// The private calendar feed: /cal/<token>.ics. Calendar apps can't sign in, so the long
// random token in the link is the key; the database only returns what that person can see.
import { createClient } from '@supabase/supabase-js';
import { calendarFor, type PlanData } from '@/src/engine/plan';
import { todayIn } from '@/src/engine/dates';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/env';
import { toIcs } from '@/lib/ics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const token = (await params).file.replace(/\.ics$/, '');
  if (!/^[a-f0-9]{48,128}$/.test(token)) return new Response('Not found', { status: 404 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc('calendar_data', { p_token: token });
  if (error) return new Response('Try again later', { status: 503 });
  if (!data) return new Response('Not found', { status: 404 });

  const d = data as PlanData & { member_id: string };
  const name = d.members.find((m) => m.id === d.member_id)?.display_name ?? 'Family';
  const body = toIcs(calendarFor(d, d.member_id, todayIn('Europe/Prague')), {
    name: `Stonebook (${name})`, origin: new URL(request.url).origin,
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="stonebook.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
}
