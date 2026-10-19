'use server';

// Every write the app makes. Each runs as the signed-in person, so the database's
// row-level security and triggers still decide what is allowed; the checks here
// are for friendly messages, not for safety.
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { KID_COOKIE } from '@/lib/kid';
import { redirect } from 'next/navigation';
import { removePhoto, savePhoto } from '@/lib/photos';
import { getMe } from '@/lib/auth';
import { addDays, isoWeekday, parseDate, todayIn } from '@/src/engine/dates';
import type { Json, RuleKindDb, Visibility } from '@/lib/database.types';
import { isActivity, isChore } from '@/lib/types';

export type ActionResult = { ok: true; waiting?: boolean; message?: string } | { ok: false; error: string };

const clean = (v: FormDataEntryValue | null, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isIsoDate = (s: string) => { try { parseDate(s); return true; } catch { return false; } };
const fail = (error: string): ActionResult => ({ ok: false, error });
const done = (): void => revalidatePath('/', 'layout');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
export async function logEvent(input: {
  objectId: string; kind: string; occurredOn: string; meterValue?: number | null; meterUnit?: string | null; note?: string;
  ruleId?: string | null;
}): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  const kind = input.kind.trim().slice(0, 80);
  if (!kind) return fail('Say what happened.');
  if (!isIsoDate(input.occurredOn)) return fail('Pick a date.');
  if (input.occurredOn > addDays(todayIn(), 1)) return fail('That date is in the future.');
  const meter = input.meterValue != null && Number.isFinite(input.meterValue) ? input.meterValue : null;
  if (meter != null && meter < 0) return fail('A reading can’t be negative.');

  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('events').insert({
    id, root_id: id, object_id: input.objectId, kind, occurred_on: input.occurredOn,
    meter_value: meter, meter_unit: meter != null ? (input.meterUnit ?? null) : null,
    note: input.note?.trim().slice(0, 500) || null, created_by: me.id, rule_id: input.ruleId || null,
  }).select('needs_confirmation').single();
  if (error) return fail('Couldn’t save that. Try again.');
  done();
  return { ok: true, waiting: data?.needs_confirmation ?? false };
}

/** Fix an entry: a new entry replaces it (or cancels it); the original stays in the history. */
export async function correctEvent(input: {
  eventId: string; objectId: string; kind: string; occurredOn: string; note?: string; remove?: boolean;
  meterValue?: number | null; meterUnit?: string | null;
}): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  if (!isIsoDate(input.occurredOn)) return fail('Pick a date.');
  const id = crypto.randomUUID();
  const { error } = await supabase.from('events').insert({
    id, root_id: id, object_id: input.objectId, kind: input.kind.trim().slice(0, 80) || 'Entry',
    occurred_on: input.occurredOn, note: input.note?.trim().slice(0, 500) || null,
    meter_value: input.meterValue ?? null, meter_unit: input.meterValue != null ? (input.meterUnit ?? null) : null,
    correction_of: input.eventId, voided: !!input.remove, created_by: me.id,
  });
  if (error) return fail('Couldn’t fix that entry. It may already have been fixed.');
  done();
  return { ok: true, message: input.remove ? 'Entry removed. It still shows in the full history as removed.' : 'Entry fixed.' };
}

// ---------------------------------------------------------------------------
// Parent confirmation of kids' chores
// ---------------------------------------------------------------------------
export async function decide(eventId: string, approved: boolean): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  if (me.role !== 'parent') return fail('Only Mum or Dad can do that.');
  const { error } = await supabase.from('confirmations').insert({ event_id: eventId, approved, decided_by: me.id });
  if (error) return fail('Already decided, or not found.');
  done();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------
const EMOJI = ['clap', 'fire', 'heart', 'star', 'muscle', 'wolf'];

export async function toggleReaction(rootEventId: string, emoji: string, on: boolean): Promise<ActionResult> {
  if (!EMOJI.includes(emoji)) return fail('Unknown reaction.');
  const { supabase, me } = await getMe();
  const { error } = on
    ? await supabase.from('reactions').insert({ event_id: rootEventId, member_id: me.id, emoji })
    : await supabase.from('reactions').delete().match({ event_id: rootEventId, member_id: me.id, emoji });
  if (error && !error.message.includes('duplicate')) return fail('Couldn’t save that reaction.');
  revalidatePath('/feed');
  return { ok: true };
}

export async function markFeedSeen(): Promise<void> {
  const { supabase, me } = await getMe();
  await supabase.from('feed_seen').upsert({ member_id: me.id, seen_at: new Date().toISOString() });
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
function fieldValues(form: FormData, keys: { key: string; kind: string; multiple?: boolean }[]): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const { key, kind, multiple } of keys) {
    if (multiple) {
      const picks = [...new Set(form.getAll(`f_${key}`).map((v) => clean(v, 300)).filter(Boolean))];
      if (picks.length) out[key] = picks;
      continue;
    }
    const raw = clean(form.get(`f_${key}`), 300);
    if (!raw) continue;
    if (kind === 'number') {
      const n = Number(raw.replace(',', '.'));
      if (Number.isFinite(n)) out[key] = n;
    } else out[key] = raw;
  }
  return out;
}

/** A photo field may only point at this item's own photos. */
function keepOwnPhoto(values: Record<string, Json>, objectId: string): Record<string, Json> {
  if (typeof values.photo === 'string' && !values.photo.startsWith(`${objectId}/`)) delete values.photo;
  return values;
}

/** Types with groups (animals): is this a group, and which group is it part of (one at most). */
async function groupingFromForm(form: FormData, typeId: string): Promise<{ row?: { is_group: boolean; parent_id: string | null }; error?: string }> {
  if (!form.has('is_group')) return {};
  const { supabase } = await getMe();
  const { data: type } = await supabase.from('object_types').select('groups').eq('id', typeId).single();
  if (!type?.groups) return {};
  const isGroup = form.get('is_group') === '1';
  const parent = isGroup ? '' : clean(form.get('parent_id'), 40);
  return { row: { is_group: isGroup, parent_id: parent || null } };
}

function friendlyError(message: string) {
  if (/required|must|group|part of|members/.test(message)) return message;
  return 'Couldn’t save. Check the details.';
}

async function fieldKeys(typeId: string) {
  const { supabase } = await getMe();
  const { data } = await supabase.from('field_defs').select('key, kind, multiple').eq('object_type_id', typeId);
  return data ?? [];
}

type RuleInsert = Record<string, unknown>;

/**
 * The reminders a form describes. Usually one; a chore on set days where different people
 * take different days (dishes: Marley Tue and Sun, Lucy Mon and Thu) makes one per person.
 * `responsible` is who gets reminded, defaulting to whoever looks after the item.
 */
function rulesFromForm(form: FormData, objectId: string, defaultOwner: string, chore: boolean): { rows: RuleInsert[]; error?: string } {
  const how = clean(form.get('how'), 20);
  const what = clean(form.get('what'), 80) || (chore ? 'Done' : '');
  const owner = clean(form.get('responsible'), 40) || defaultOwner;
  // A group task: one reminder per person, each ticks their own part.
  const people = [...new Set(form.getAll('people').map((v) => clean(v, 40)).filter(Boolean))];
  const completion = clean(form.get('completion'), 4) === 'done' ? 'done' : clean(form.get('completion'), 4) === 'log' ? 'log' : chore ? 'done' : 'log';
  const forEach = (row: RuleInsert) => ({ rows: (people.length > 1 ? people : [row.owner_id as string]).map((who) => ({ ...row, owner_id: who })) });
  const num = (name: string) => { const n = Number(clean(form.get(name), 12)); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const base = { object_id: objectId, owner_id: people[0] ?? owner, name: what || 'Reminder', event_kind: what || null, completion };
  const one = forEach;
  switch (how) {
    case '':
    case 'none':
      return { rows: [] };
    case 'record':
      return { rows: [{ ...base, kind: 'record' as RuleKindDb, event_kind: null, name: 'History only' }] };
    case 'daily':
      return one({ ...base, kind: 'interval', every_days: 1, lead_days: [1], starts_on: todayIn() });
    case 'weekly': {
      const days = [...new Set(form.getAll('days').map(Number).filter((d) => d >= 1 && d <= 7))].sort();
      if (days.length === 0) return { rows: [], error: 'Pick at least one day.' };
      if (people.length > 1) return forEach({ ...base, kind: 'weekly', weekdays: days });
      const byOwner = new Map<string, number[]>();
      for (const d of days) {
        const who = clean(form.get(`day_owner_${d}`), 40) || owner;
        byOwner.set(who, [...(byOwner.get(who) ?? []), d]);
      }
      return { rows: [...byOwner].map(([who, ds]) => ({ ...base, owner_id: who, kind: 'weekly', weekdays: ds })) };
    }
    case 'interval': {
      const n = num('every_n');
      const unit = clean(form.get('every_unit'), 10);
      if (!n) return { rows: [], error: 'Say how often.' };
      if (!what) return { rows: [], error: 'Say what gets done, e.g. "Filter changed".' };
      const start = clean(form.get('last_done'), 10);
      return one({ ...base, kind: 'interval', every_months: unit === 'months' ? n : null, every_days: unit === 'weeks' ? n * 7 : unit === 'days' ? n : null,
        starts_on: isIsoDate(start) ? start : chore ? todayIn() : null, lead_days: chore ? [1] : [14, 1] });
    }
    case 'meter': {
      const n = num('meter_every');
      const unit = clean(form.get('meter_unit'), 10) || 'km';
      if (!n) return { rows: [], error: 'Say every how many km or hours.' };
      if (!what) return { rows: [], error: 'Say what gets done, e.g. "Service".' };
      const months = num('meter_months');
      const startReading = Number(clean(form.get('meter_start'), 12));
      return one({ ...base, kind: 'interval', meter_every: n, meter_unit: unit, every_months: months,
        meter_start: Number.isFinite(startReading) && startReading > 0 ? startReading : null });
    }
    case 'date': {
      const due = clean(form.get('due_on'), 10);
      if (!isIsoDate(due)) return { rows: [], error: 'Pick the date.' };
      const repeat = chore ? null : num('renew_months');
      return one({ ...base, kind: 'fixed_date', event_kind: what || 'Done', name: what || (chore ? 'Do it' : 'Due'), due_on: due,
        renew_every_months: repeat, ...(chore ? { starts_on: todayIn(), lead_days: [1] } : {}) });
    }
    default:
      return { rows: [], error: 'Unknown schedule.' };
  }
}

/** Weekly times for an activity or work, from the form (days, starts_at, ends_at, drop_off_by, pick_up_by). */
function slotFromForm(form: FormData, objectId: string): { row?: Record<string, unknown>; error?: string } {
  const once = clean(form.get('slot_when'), 10) === 'once';
  const onDate = clean(form.get('slot_date'), 10);
  if (once && !isIsoDate(onDate)) return { error: 'Pick the date.' };
  const days = once ? [isoWeekday(onDate)] : [...new Set(form.getAll('slot_days').map(Number).filter((d) => d >= 1 && d <= 7))].sort();
  const people = [...new Set(form.getAll('slot_people').map((v) => clean(v, 40)).filter(Boolean))];
  const starts = clean(form.get('starts_at'), 5);
  const ends = clean(form.get('ends_at'), 5);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (days.length === 0 && !starts) return {};
  if (days.length === 0) return { error: 'Pick the day or days.' };
  if (!time.test(starts)) return { error: 'Say what time it starts.' };
  if (ends && (!time.test(ends) || ends <= starts)) return { error: 'The end time should be after the start.' };
  return { row: { object_id: objectId, weekdays: days, on_date: once ? onDate : null, people, starts_at: starts, ends_at: ends || null,
    drop_off_by: clean(form.get('drop_off_by'), 40) || null, pick_up_by: clean(form.get('pick_up_by'), 40) || null } };
}

export async function createItem(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  const typeId = clean(form.get('type_id'), 40);
  const name = clean(form.get('name'), 120);
  const ownerId = clean(form.get('owner_id'), 40) || me.id;
  const visibility = (clean(form.get('visibility'), 10) || 'shared') as Visibility;
  if (!name) return fail('Give it a name.');
  if (!['shared', 'personal', 'private'].includes(visibility)) return fail('Pick who can see it.');
  const { data: type } = await supabase.from('object_types').select('name, assignable').eq('id', typeId).single();
  if (!type) return fail('Pick what kind of thing it is.');
  if (me.role !== 'parent' && ownerId !== me.id) {
    if (!type.assignable) return fail('You can add things for yourself.');
    if (visibility !== 'shared') return fail('A chore or task you give someone else is shared with the family.');
  }
  if (visibility === 'private' && ownerId !== me.id) return fail('Only the owner can make something private.');
  if (new Set(form.getAll('people')).size > 1 && visibility !== 'shared') return fail('A group job is shared with the family, so everyone on it can see it.');

  const objectId = crypto.randomUUID();
  const grouping = await groupingFromForm(form, typeId);
  if (grouping.error) return fail(grouping.error);
  const ruleCheck = isActivity(type.name) ? { rows: [] } : rulesFromForm(form, objectId, ownerId, isChore(type.name));
  if (ruleCheck.error) return fail(ruleCheck.error);
  const slotCheck = isActivity(type.name) ? slotFromForm(form, objectId) : {};
  if (slotCheck.error) return fail(slotCheck.error);

  const { error } = await supabase.from('objects').insert({
    id: objectId, object_type_id: typeId, name, owner_id: ownerId, visibility,
    share_with_family: visibility === 'personal' && form.get('share_with_family') === 'on',
    field_values: keepOwnPhoto(fieldValues(form, await fieldKeys(typeId)), objectId),
    ...grouping.row,
  });
  if (error) return fail(friendlyError(error.message));
  const photo = await savePhoto(objectId, form.get('photo_file'));
  if (photo.error) return fail(`Saved, but ${photo.error.charAt(0).toLowerCase()}${photo.error.slice(1)}`);
  if (photo.path) {
    const { data: row } = await supabase.from('objects').select('field_values').eq('id', objectId).single();
    await supabase.from('objects').update({ field_values: { ...(row?.field_values as object), photo: photo.path } }).eq('id', objectId);
  }
  if (ruleCheck.rows.length) {
    const { error: ruleError } = await supabase.from('rules').insert(ruleCheck.rows as never);
    if (ruleError) return fail('Saved, but the reminder didn’t save. Add it from the item page.');
  }
  if (slotCheck.row) {
    const { error: slotError } = await supabase.from('activity_slots').insert(slotCheck.row as never);
    if (slotError) return fail('Saved, but the times didn’t save. Add them from the item page.');
  }
  done();
  redirect(`/things/${objectId}?added=1`);
}

export async function updateDetails(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await getMe();
  const objectId = clean(form.get('object_id'), 40);
  const name = clean(form.get('name'), 120);
  const { data: obj } = await supabase.from('objects').select('object_type_id, field_values').eq('id', objectId).single();
  if (!obj) return fail('Not found.');
  if (!name) return fail('Give it a name.');
  const visibility = clean(form.get('visibility'), 10) as Visibility;
  const grouping = await groupingFromForm(form, obj.object_type_id);
  if (grouping.error) return fail(grouping.error);
  const values = keepOwnPhoto(fieldValues(form, await fieldKeys(obj.object_type_id)), objectId);
  const photo = await savePhoto(objectId, form.get('photo_file'));
  if (photo.error) return fail(photo.error);
  if (photo.path) values.photo = photo.path;
  const oldPhoto = (obj.field_values as Record<string, unknown> | null)?.photo as string | undefined;
  const patch: Record<string, unknown> = { name, field_values: values, ...grouping.row };
  if (['shared', 'personal', 'private'].includes(visibility)) {
    patch.visibility = visibility;
    patch.share_with_family = visibility === 'personal' && form.get('share_with_family') === 'on';
  }
  const { error, count } = await supabase.from('objects').update(patch as never, { count: 'exact' }).eq('id', objectId);
  if (error) {
    if (photo.path) await removePhoto(photo.path);
    return fail(error.message.includes('row-level') ? 'Only the creator and owner can make this private.' : friendlyError(error.message));
  }
  if (count === 0) return fail('You can’t change this one.');
  if (oldPhoto && oldPhoto !== values.photo) await removePhoto(oldPhoto);
  done();
  return { ok: true, message: 'Details saved.' };
}

export async function setArchived(objectId: string, archived: boolean): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error, count } = await supabase.from('objects')
    .update({ archived_at: archived ? new Date().toISOString() : null }, { count: 'exact' }).eq('id', objectId);
  if (error || count === 0) return fail('You can’t change this one.');
  done();
  return { ok: true, message: archived ? 'Archived. Its history is kept and still shows in search.' : 'Back in your lists.' };
}

export async function addRule(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await getMe();
  const objectId = clean(form.get('object_id'), 40);
  const { data: obj } = await supabase.from('objects').select('owner_id, object_type_id').eq('id', objectId).single();
  if (!obj) return fail('Not found.');
  const { data: type } = await supabase.from('object_types').select('name').eq('id', obj.object_type_id).single();
  const rule = rulesFromForm(form, objectId, obj.owner_id, isChore(type?.name));
  if (rule.error) return fail(rule.error);
  if (!rule.rows.length) return fail('Pick how often.');
  const { error } = await supabase.from('rules').insert(rule.rows as never);
  if (error) return fail('You can’t add reminders to this one.');
  done();
  return { ok: true, message: rule.rows.length > 1 ? `${rule.rows.length} reminders added, one per person.` : 'Reminder added.' };
}

export async function stopRule(ruleId: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error, count } = await supabase.from('rules').update({ active: false }, { count: 'exact' }).eq('id', ruleId);
  if (error || count === 0) return fail('You can’t change this one.');
  done();
  return { ok: true, message: 'Reminder stopped. Past history stays.' };
}

// ---------------------------------------------------------------------------
// Activities and work
// ---------------------------------------------------------------------------
export async function addSlot(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await getMe();
  const objectId = clean(form.get('object_id'), 40);
  const slot = slotFromForm(form, objectId);
  if (slot.error) return fail(slot.error);
  if (!slot.row) return fail('Pick the day and time.');
  const { error } = await supabase.from('activity_slots').insert(slot.row as never);
  if (error) return fail('Only the person it belongs to, or Mum or Dad, can change this.');
  done();
  return { ok: true, message: 'Times added.' };
}

export async function stopSlot(slotId: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error, count } = await supabase.from('activity_slots').update({ active: false }, { count: 'exact' }).eq('id', slotId);
  if (error || count === 0) return fail('You can’t change this one.');
  done();
  return { ok: true, message: 'Removed. It no longer shows on Today.' };
}

/** Change one date: someone else drives, or it's off. `reset` goes back to the usual. */
export async function changeSession(input: {
  slotId: string; date: string; cancelled: boolean; dropOffBy: string | null; pickUpBy: string | null; note?: string; reset?: boolean;
}): Promise<ActionResult> {
  const { supabase } = await getMe();
  if (!isIsoDate(input.date)) return fail('Pick a date.');
  const { error } = input.reset
    ? await supabase.from('activity_changes').delete().match({ slot_id: input.slotId, on_date: input.date })
    : await supabase.from('activity_changes').upsert({
        slot_id: input.slotId, on_date: input.date, cancelled: input.cancelled,
        drop_off_by: input.dropOffBy || null, pick_up_by: input.pickUpBy || null, note: input.note?.trim().slice(0, 300) || null,
      });
  if (error) return fail('Only the person it belongs to, or Mum or Dad, can change this.');
  done();
  return { ok: true, message: input.reset ? 'Back to the usual.' : input.cancelled ? 'Marked as off that day.' : 'Changed for that day.' };
}

// ---------------------------------------------------------------------------
// Reminders on this phone, and the private calendar link
// ---------------------------------------------------------------------------
export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string; device: string }): Promise<ActionResult> {
  const { supabase } = await getMe();
  if (!/^https:\/\//.test(sub.endpoint)) return fail('This browser gave an unusual address. Try Chrome.');
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_device: sub.device.slice(0, 120),
  });
  if (error) return fail('Couldn’t turn reminders on. Try again.');
  revalidatePath('/settings');
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  revalidatePath('/settings');
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { data, error } = await supabase.functions.invoke('remind', { body: { test: true } });
  if (error) return fail('The reminder service didn’t answer. Try again in a minute.');
  const r = data as { phones: number; delivered: number };
  if (!r.phones) return fail('No phones are set up for you yet.');
  return { ok: true, message: r.delivered ? `Sent to ${r.delivered} ${r.delivered === 1 ? 'phone' : 'phones'}. It should arrive in a few seconds.` : 'Couldn’t reach your phone. Turn reminders off and on again.' };
}

export async function resetCalendarLink(): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error } = await supabase.rpc('calendar_link_reset');
  if (error) return fail('Couldn’t make a link. Try again.');
  revalidatePath('/settings');
  return { ok: true, message: 'New link ready. Any old link has stopped working.' };
}

// ---------------------------------------------------------------------------
// PINs and Benji mode on the family tablet
// ---------------------------------------------------------------------------
export async function setPin(memberId: string, pin: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  if (!/^\d{4}$/.test(pin)) return fail('A PIN is 4 digits.');
  const { error } = await supabase.rpc('set_pin', { p_member: memberId, p_pin: pin });
  if (error) return fail(error.message.includes('Only') ? 'Only Mum or Dad can set PINs.' : 'Couldn’t save the PIN.');
  revalidatePath('/settings');
  return { ok: true, message: 'PIN saved.' };
}

export async function startKidMode(childId: string): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  if (me.role !== 'parent') return fail('Only Mum or Dad can do that.');
  const { data: set } = await supabase.rpc('pins_set');
  const ids = new Set(((set ?? []) as unknown as string[]).map(String));
  if (!ids.has(me.id)) return fail('Set your own PIN first, so you can get back out.');
  if (!ids.has(childId)) return fail('Set the child’s PIN first.');
  (await cookies()).set(KID_COOKIE, childId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/kid');
}

export async function exitKidMode(pin: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { data, error } = await supabase.rpc('check_parent_pin', { p_pin: pin });
  if (error) return fail('Couldn’t check that. Try again.');
  if (data === 'locked') return fail('Too many tries. Wait 15 minutes.');
  if (data === 'none') return fail('No parent PIN is set.');
  if (data !== 'ok') return fail('That’s not right.');
  (await cookies()).delete(KID_COOKIE);
  redirect('/');
}

export async function kidDone(input: { childId: string; objectId: string; ruleId: string | null; pin: string }): Promise<ActionResult> {
  const { supabase } = await getMe();
  const jar = await cookies();
  if (jar.get(KID_COOKIE)?.value !== input.childId) return fail('This tablet isn’t in that mode.');
  const { data, error } = await supabase.rpc('child_log', {
    p_child: input.childId, p_pin: input.pin, p_object: input.objectId, p_rule: input.ruleId as string,
  });
  if (error) return fail('Something went wrong. Ask Mum or Dad.');
  const r = data as { result: string; waiting?: boolean };
  if (r.result === 'locked') return fail('Too many tries. Ask Mum or Dad.');
  if (r.result === 'none') return fail('Ask Mum or Dad to set your PIN.');
  if (r.result !== 'ok') return fail('Oops, that’s not your PIN. Try again.');
  revalidatePath('/kid');
  return { ok: true, waiting: !!r.waiting };
}

// ---------------------------------------------------------------------------
// Done in one tap (with undo), abort mission, and the Done-or-Log switch
// ---------------------------------------------------------------------------
export async function quickDone(objectId: string, ruleId: string | null): Promise<ActionResult & { eventId?: string }> {
  const { supabase, me } = await getMe();
  const { data: rule } = ruleId ? await supabase.from('rules').select('event_kind').eq('id', ruleId).single() : { data: null };
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('events').insert({
    id, root_id: id, object_id: objectId, kind: rule?.event_kind || 'Done', occurred_on: todayIn(), created_by: me.id, rule_id: ruleId,
  }).select('needs_confirmation').single();
  if (error) return fail('Couldn’t save that. Try again.');
  done();
  return { ok: true, waiting: data?.needs_confirmation ?? false, eventId: id };
}

export async function undoDone(eventId: string, objectId: string): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  const { data: original } = await supabase.from('events').select('kind, occurred_on').eq('id', eventId).single();
  if (!original) return fail('Couldn’t undo that.');
  const id = crypto.randomUUID();
  const { error } = await supabase.from('events').insert({
    id, root_id: id, object_id: objectId, kind: original.kind, occurred_on: original.occurred_on, correction_of: eventId, voided: true,
    note: 'Undone', created_by: me.id,
  });
  if (error) return fail('Couldn’t undo that.');
  done();
  return { ok: true, message: 'Undone.' };
}

/** Someone tagged on a group task who didn't take part closes their part, without the hearts. */
export async function abortMission(objectId: string, ruleId: string): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  const { data: rule } = await supabase.from('rules').select('event_kind, owner_id').eq('id', ruleId).single();
  if (!rule) return fail('Not found.');
  if (rule.owner_id !== me.id && me.role !== 'parent') return fail('Only for your own part.');
  const id = crypto.randomUUID();
  const { error } = await supabase.from('events').insert({
    id, root_id: id, object_id: objectId, kind: rule.event_kind || 'Done', occurred_on: todayIn(), created_by: me.id, rule_id: ruleId,
    data: { skipped: true }, note: 'Abort mission',
  });
  if (error) return fail('Couldn’t save that.');
  done();
  return { ok: true, message: 'Mission aborted. No hearts this time.' };
}

export async function setRuleCompletion(ruleId: string, completion: 'done' | 'log'): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error, count } = await supabase.from('rules').update({ completion }, { count: 'exact' }).eq('id', ruleId);
  if (error || count === 0) return fail('You can’t change this one.');
  done();
  return { ok: true, message: completion === 'done' ? 'Now one tap: Done.' : 'Now opens Log for details.' };
}

export async function setMemberColor(memberId: string, color: string): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  if (me.role !== 'parent') return fail('Only Mum or Dad can choose colours.');
  if (!['moss', 'sky', 'clay', 'plum', 'hay', 'slate', 'rose', 'teal'].includes(color)) return fail('Pick one of the colours.');
  const { error } = await supabase.from('members').update({ color: color as never }).eq('id', memberId);
  if (error) return fail('Couldn’t save the colour.');
  done();
  return { ok: true };
}
