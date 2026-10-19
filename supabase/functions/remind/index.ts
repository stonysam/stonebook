// Sends Stonebook's phone reminders (Web Push).
//
// Two ways in:
// - Every 15 minutes from pg_cron, with the shared secret in `x-cron-secret`: works out
//   each person's morning summary and lift heads-ups (src/engine/plan.ts) and sends
//   whatever hasn't gone out yet.
// - From the app's "Send me a test" button, as the signed-in person: one test to their phones.
//
// Secrets never leave Supabase: the cron secret and the push signing keys live in Vault
// (read through service-role-only functions). The signing keys are made on the first run.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import { nowIn } from './_engine/dates.ts';
import { noticesFor, type Notice, type PlanData } from './_engine/plan.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || (JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default ?? '');
const db = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });

const secret = async (name: string): Promise<string | null> => {
  const { data, error } = await db.rpc('stonebook_secret', { p_name: name });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
};

let ready: Promise<void> | null = null;
/** Loads the push signing keys, making and storing them the first time. */
function setupPush(): Promise<void> {
  ready ??= (async () => {
    let pub = await secret('vapid_public');
    let priv = await secret('vapid_private');
    if (!pub || !priv) {
      const keys = webpush.generateVAPIDKeys();
      const { error } = await db.rpc('stonebook_store_vapid', { p_public: keys.publicKey, p_private: keys.privateKey });
      if (error) throw new Error(error.message);
      pub = await secret('vapid_public'); // another run may have got there first; use what's stored
      priv = await secret('vapid_private');
    }
    webpush.setVapidDetails('https://stonebook-mu.vercel.app', pub!, priv!);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

interface Sub { endpoint: string; member_id: string; p256dh: string; auth: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Sends one notice to one phone. Returns 'gone' when the phone has unsubscribed. */
async function push(sub: Sub, n: Notice, urgent: boolean): Promise<'ok' | 'gone' | 'failed'> {
  try {
    // web-push encrypts and signs; Deno's fetch sends.
    const req = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
      { TTL: urgent ? 1800 : 4 * 3600, urgency: urgent ? 'high' : 'normal' },
    );
    const res = await fetch(req.endpoint, { method: req.method, headers: req.headers as Record<string, string>, body: req.body });
    if (res.ok) return 'ok';
    if (res.status === 404 || res.status === 410) return 'gone';
    console.error('push failed', res.status, await res.text());
    return 'failed';
  } catch (e) {
    console.error('push failed', (e as Error).message);
    return 'failed';
  }
}

async function load(today: string): Promise<{ data: PlanData; subs: Sub[]; sent: Set<string> }> {
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const q = await Promise.all([
    db.from('members').select('id, display_name, role'),
    db.from('objects').select('id, name, owner_id, object_type_id, archived_at, created_by').is('archived_at', null),
    db.from('object_types').select('id, name, assignable'),
    db.from('rules').select('*').eq('active', true),
    db.from('effective_events').select('id, object_id, kind, occurred_on, meter_value, meter_unit, data, created_by, created_at, rule_id'),
    db.from('activity_slots').select('*').eq('active', true),
    db.from('activity_changes').select('slot_id, on_date, cancelled, drop_off_by, pick_up_by, note').gte('on_date', yesterday),
    db.from('push_subscriptions').select('endpoint, member_id, p256dh, auth'),
    db.from('notification_log').select('member_id, key').gte('sent_at', new Date(Date.now() - 3 * 86_400_000).toISOString()),
  ]);
  const failed = q.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  const [members, objects, types, rules, events, slots, changes, subs, log] = q.map((r) => r.data ?? []);
  return {
    data: { members, objects, types, rules, events, slots, changes } as unknown as PlanData,
    subs: subs as Sub[],
    sent: new Set((log as { member_id: string; key: string }[]).map((l) => `${l.member_id}|${l.key}`)),
  };
}

async function runSchedule(dryRun: boolean) {
  const now = nowIn('Europe/Prague');
  const { data, subs, sent } = await load(now.date);
  const report: { member: string; key: string; phones: number }[] = [];
  const gone = new Set<string>();

  for (const member of data.members) {
    const phones = subs.filter((s) => s.member_id === member.id);
    if (phones.length === 0) continue;
    for (const n of noticesFor(data, member.id, now)) {
      if (sent.has(`${member.id}|${n.key}`)) continue;
      report.push({ member: member.display_name, key: n.key, phones: phones.length });
      if (dryRun) continue;
      // Logged before sending: a phone that's off misses it rather than getting it four times.
      const { error } = await db.from('notification_log').insert({ member_id: member.id, key: n.key });
      if (error) continue; // another run got there first
      for (const phone of phones) {
        if ((await push(phone, n, n.key.startsWith('lift:'))) === 'gone') gone.add(phone.endpoint);
      }
    }
  }

  if (!dryRun) {
    if (gone.size) await db.from('push_subscriptions').delete().in('endpoint', [...gone]);
    await db.from('notification_log').delete().lt('sent_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  }
  return { at: now, sent: report, removedPhones: gone.size, dryRun };
}

async function sendTest(authorization: string) {
  const { data: user } = await db.auth.getUser(authorization.replace(/^Bearer /, ''));
  if (!user?.user) return json({ error: 'Not signed in' }, 401);
  const { data: member } = await db.from('members').select('id, display_name').eq('auth_user_id', user.user.id).single();
  if (!member) return json({ error: 'Not on the family list' }, 403);
  const { data: phones } = await db.from('push_subscriptions').select('endpoint, member_id, p256dh, auth').eq('member_id', member.id);
  let ok = 0;
  for (const phone of (phones ?? []) as Sub[]) {
    const r = await push(phone, { key: `test:${Date.now()}`, title: 'Stonebook reminders are on', body: `Hi ${member.display_name}, this phone will get your morning summary and lift reminders.`, url: '/' }, true);
    if (r === 'ok') ok++;
    if (r === 'gone') await db.from('push_subscriptions').delete().eq('endpoint', phone.endpoint);
  }
  return json({ phones: phones?.length ?? 0, delivered: ok });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const given = req.headers.get('x-cron-secret');
  try {
    await setupPush();
  } catch (e) {
    console.error(e);
    return json({ error: 'Setup failed' }, 500);
  }
  if (given) {
    const expected = await secret('cron_secret');
    if (!expected || given !== expected) return json({ error: 'Forbidden' }, 403);
    const body = await req.json().catch(() => ({}));
    try {
      return json(await runSchedule(body?.dryRun === true));
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  }
  const auth = req.headers.get('Authorization');
  if (auth) return sendTest(auth);
  return json({ error: 'Forbidden' }, 403);
});
