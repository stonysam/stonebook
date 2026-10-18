'use server';

// Every write the app makes. Each runs as the signed-in person, so the database's
// row-level security and triggers still decide what is allowed; the checks here
// are for friendly messages, not for safety.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { addDays, parseDate, todayIn } from '@/src/engine/dates';
import type { Json, RuleKindDb, Visibility } from '@/lib/database.types';

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
    note: input.note?.trim().slice(0, 500) || null, created_by: me.id,
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
function fieldValues(form: FormData, keys: { key: string; kind: string }[]): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const { key, kind } of keys) {
    const raw = clean(form.get(`f_${key}`), 300);
    if (!raw) continue;
    if (kind === 'number') {
      const n = Number(raw.replace(',', '.'));
      if (Number.isFinite(n)) out[key] = n;
    } else out[key] = raw;
  }
  return out;
}

async function fieldKeys(typeId: string) {
  const { supabase } = await getMe();
  const { data } = await supabase.from('field_defs').select('key, kind').eq('object_type_id', typeId);
  return data ?? [];
}

function ruleFromForm(form: FormData, objectId: string, ownerId: string, isChore: boolean): { row?: Record<string, unknown>; error?: string } {
  const how = clean(form.get('how'), 20);
  const what = clean(form.get('what'), 80) || (isChore ? 'Done' : '');
  const num = (name: string) => { const n = Number(clean(form.get(name), 12)); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const base = { object_id: objectId, owner_id: ownerId, name: what || 'Reminder', event_kind: what || null };
  switch (how) {
    case '':
    case 'none':
      return {};
    case 'record':
      return { row: { ...base, kind: 'record' as RuleKindDb, event_kind: null, name: 'History only' } };
    case 'daily':
      return { row: { ...base, kind: 'interval', every_days: 1, lead_days: [1], starts_on: todayIn() } };
    case 'weekly': {
      const days = form.getAll('days').map(Number).filter((d) => d >= 1 && d <= 7);
      if (days.length === 0) return { error: 'Pick at least one day.' };
      return { row: { ...base, kind: 'weekly', weekdays: [...new Set(days)].sort() } };
    }
    case 'interval': {
      const n = num('every_n');
      const unit = clean(form.get('every_unit'), 10);
      if (!n) return { error: 'Say how often.' };
      if (!what) return { error: 'Say what gets done, e.g. "Filter changed".' };
      const start = clean(form.get('last_done'), 10);
      return { row: { ...base, kind: 'interval', every_months: unit === 'months' ? n : null, every_days: unit === 'weeks' ? n * 7 : unit === 'days' ? n : null,
        starts_on: isIsoDate(start) ? start : null, lead_days: isChore ? [1] : [14, 1] } };
    }
    case 'meter': {
      const n = num('meter_every');
      const unit = clean(form.get('meter_unit'), 10) || 'km';
      if (!n) return { error: 'Say every how many km or hours.' };
      if (!what) return { error: 'Say what gets done, e.g. "Service".' };
      const months = num('meter_months');
      const startReading = Number(clean(form.get('meter_start'), 12));
      return { row: { ...base, kind: 'interval', meter_every: n, meter_unit: unit, every_months: months,
        meter_start: Number.isFinite(startReading) && startReading > 0 ? startReading : null } };
    }
    case 'date': {
      const due = clean(form.get('due_on'), 10);
      if (!isIsoDate(due)) return { error: 'Pick the date.' };
      const repeat = num('renew_months');
      return { row: { ...base, kind: 'fixed_date', event_kind: what || 'Done', name: what || 'Due', due_on: due, renew_every_months: repeat } };
    }
    default:
      return { error: 'Unknown schedule.' };
  }
}

export async function createItem(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase, me } = await getMe();
  const typeId = clean(form.get('type_id'), 40);
  const name = clean(form.get('name'), 120);
  const ownerId = clean(form.get('owner_id'), 40) || me.id;
  const visibility = (clean(form.get('visibility'), 10) || 'shared') as Visibility;
  if (!name) return fail('Give it a name.');
  if (!['shared', 'personal', 'private'].includes(visibility)) return fail('Pick who can see it.');
  if (me.role !== 'parent' && ownerId !== me.id) return fail('You can add things for yourself.');
  if (visibility === 'private' && ownerId !== me.id) return fail('Only the owner can make something private.');

  const { data: type } = await supabase.from('object_types').select('name').eq('id', typeId).single();
  const isChore = type?.name === 'Chore';
  const objectId = crypto.randomUUID();
  const ruleCheck = ruleFromForm(form, objectId, ownerId, isChore);
  if (ruleCheck.error) return fail(ruleCheck.error);

  const { error } = await supabase.from('objects').insert({
    id: objectId, object_type_id: typeId, name, owner_id: ownerId, visibility,
    share_with_family: visibility === 'personal' && form.get('share_with_family') === 'on',
    field_values: fieldValues(form, await fieldKeys(typeId)),
  });
  if (error) return fail(error.message.includes('required') || error.message.includes('must') ? error.message : 'Couldn’t save. Check the details.');
  if (ruleCheck.row) {
    const { error: ruleError } = await supabase.from('rules').insert(ruleCheck.row as never);
    if (ruleError) return fail('Saved, but the reminder didn’t save. Add it from the item page.');
  }
  done();
  redirect(`/things/${objectId}?added=1`);
}

export async function updateDetails(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await getMe();
  const objectId = clean(form.get('object_id'), 40);
  const name = clean(form.get('name'), 120);
  const { data: obj } = await supabase.from('objects').select('object_type_id').eq('id', objectId).single();
  if (!obj) return fail('Not found.');
  if (!name) return fail('Give it a name.');
  const visibility = clean(form.get('visibility'), 10) as Visibility;
  const patch: Record<string, unknown> = { name, field_values: fieldValues(form, await fieldKeys(obj.object_type_id)) };
  if (['shared', 'personal', 'private'].includes(visibility)) {
    patch.visibility = visibility;
    patch.share_with_family = visibility === 'personal' && form.get('share_with_family') === 'on';
  }
  const { error, count } = await supabase.from('objects').update(patch as never, { count: 'exact' }).eq('id', objectId);
  if (error) return fail(error.message.includes('row-level') ? 'Only the creator and owner can make this private.' : 'Couldn’t save. Check the details.');
  if (count === 0) return fail('You can’t change this one.');
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
  const rule = ruleFromForm(form, objectId, obj.owner_id, type?.name === 'Chore');
  if (rule.error) return fail(rule.error);
  if (!rule.row) return fail('Pick how often.');
  const { error } = await supabase.from('rules').insert(rule.row as never);
  if (error) return fail('You can’t add reminders to this one.');
  done();
  return { ok: true, message: 'Reminder added.' };
}

export async function stopRule(ruleId: string): Promise<ActionResult> {
  const { supabase } = await getMe();
  const { error, count } = await supabase.from('rules').update({ active: false }, { count: 'exact' }).eq('id', ruleId);
  if (error || count === 0) return fail('You can’t change this one.');
  done();
  return { ok: true, message: 'Reminder stopped. Past history stays.' };
}
