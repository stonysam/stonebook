'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import type { FieldKind } from '@/lib/database.types';
import { isBuiltInKind, isLockedField, type FieldKindChoice } from '@/lib/types';
import type { ActionResult } from './actions';

const clean = (v: FormDataEntryValue | null, max = 80) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const fail = (error: string): ActionResult => ({ ok: false, error });
const done = () => revalidatePath('/', 'layout');
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function asParent() {
  const ctx = await getMe();
  if (ctx.me.role !== 'parent') throw new Error('Only Mum or Dad can change kinds of things.');
  return ctx;
}

/** Answers for a list detail, one per line or comma, without repeats. */
function optionsFrom(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((o) => o.trim().slice(0, 40)).filter(Boolean))].slice(0, 40);
}

/** A stable key for a detail, from its first label: "Tyre size" → tyre_size. */
function keyFor(label: string, taken: string[], reserved: string[]): string {
  const base = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 30) || 'detail';
  let key = base;
  for (let i = 2; taken.includes(key) || reserved.includes(key); i++) key = `${base}_${i}`;
  return key;
}

export async function createKind(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await asParent();
  const name = sentence(clean(form.get('name'), 40));
  if (!name) return fail('Give it a name, like Cabin or Bike.');
  const { data: last } = await supabase.from('object_types').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('object_types').insert({ name, icon: 'box', sort_order: (last?.sort_order ?? 0) + 10 }).select('id').single();
  if (error) return fail(error.code === '23505' ? 'There’s already a kind with that name.' : 'Couldn’t add it.');
  done();
  redirect(`/settings/kinds/${data.id}`);
}

export async function renameKind(typeId: string, newName: string): Promise<ActionResult> {
  const { supabase } = await asParent();
  const name = sentence(clean(newName, 40));
  const { data: type } = await supabase.from('object_types').select('name').eq('id', typeId).single();
  if (!type) return fail('Not found.');
  if (isBuiltInKind(type.name)) return fail('This is one of the app’s own kinds, so its name stays.');
  if (!name) return fail('Give it a name.');
  const { error } = await supabase.from('object_types').update({ name }).eq('id', typeId);
  if (error) return fail(error.code === '23505' ? 'There’s already a kind with that name.' : 'Couldn’t rename it.');
  done();
  return { ok: true, message: 'Renamed.' };
}

export async function setKindIcon(typeId: string, icon: string): Promise<ActionResult> {
  const { supabase } = await asParent();
  if (!/^[a-z-]{2,20}$/.test(icon)) return fail('Pick an icon.');
  const { error } = await supabase.from('object_types').update({ icon }).eq('id', typeId);
  if (error) return fail('Couldn’t change it.');
  done();
  return { ok: true };
}

export async function setKindHidden(typeId: string, hidden: boolean): Promise<ActionResult> {
  const { supabase } = await asParent();
  const { error } = await supabase.from('object_types').update({ hidden }).eq('id', typeId);
  if (error) return fail('Couldn’t change it.');
  done();
  return { ok: true, message: hidden ? 'Hidden from Add. Its things stay as they are.' : 'Back in the Add list.' };
}

export async function removeKind(typeId: string): Promise<ActionResult> {
  const { supabase } = await asParent();
  const { data: type } = await supabase.from('object_types').select('name').eq('id', typeId).single();
  if (!type) return fail('Not found.');
  if (isBuiltInKind(type.name)) return fail('This is one of the app’s own kinds. Hide it instead.');
  const { data: used } = await supabase.rpc('kind_usage', { p_type: typeId });
  if (used) return fail(`${used} ${used === 1 ? 'thing is' : 'things are'} this kind, so it can’t go. Hide it instead.`);
  const { error } = await supabase.from('object_types').delete().eq('id', typeId);
  if (error) return fail('Couldn’t remove it.');
  done();
  redirect('/settings/kinds');
}

/** Moves a kind or a detail one place up or down. */
export async function move(table: 'object_types' | 'field_defs', id: string, dir: -1 | 1): Promise<ActionResult> {
  const { supabase } = await asParent();
  if (table !== 'object_types' && table !== 'field_defs') return fail('Not found.');
  let siblings: { id: string; sort_order: number }[] = [];
  if (table === 'object_types') {
    siblings = (await supabase.from('object_types').select('id, sort_order').order('sort_order').order('name')).data ?? [];
  } else {
    const { data: f } = await supabase.from('field_defs').select('object_type_id').eq('id', id).single();
    if (!f) return fail('Not found.');
    siblings = (await supabase.from('field_defs').select('id, sort_order').eq('object_type_id', f.object_type_id).order('sort_order').order('label')).data ?? [];
  }
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return { ok: true };
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  // Renumber in tens so later moves always have room.
  for (const [n, s] of siblings.entries()) {
    if (s.sort_order !== (n + 1) * 10) await supabase.from(table).update({ sort_order: (n + 1) * 10 }).eq('id', s.id);
  }
  done();
  return { ok: true };
}

export async function addField(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await asParent();
  const typeId = clean(form.get('type_id'), 40);
  const label = sentence(clean(form.get('label'), 40));
  const kind = clean(form.get('kind'), 10) as FieldKindChoice;
  const options = optionsFrom(String(form.get('options') ?? ''));
  const multiple = form.get('multiple') === 'on';
  const required = form.get('required') === 'on';
  if (!label) return fail('Give the detail a name, like Tyre size.');
  if (!['text', 'number', 'date', 'choice', 'person', 'photo'].includes(kind)) return fail('Pick what kind of detail it is.');
  if (kind === 'choice' && options.length < 2) return fail('Add at least two answers to pick from.');
  const { data: existing } = await supabase.from('field_defs').select('key, sort_order').eq('object_type_id', typeId);
  const taken = (existing ?? []).map((f) => f.key);
  if (kind === 'photo' && taken.includes('photo')) return fail('This kind already has a photo.');
  if (required) {
    const { data: used } = await supabase.rpc('kind_usage', { p_type: typeId });
    if (used) return fail('Things of this kind already exist without it, so it can’t be a must-have. Add it as optional.');
  }
  const key = kind === 'photo' ? 'photo' : keyFor(label, taken, ['photo', 'picture', 'birth_year', 'head_count']);
  const { error } = await supabase.from('field_defs').insert({
    object_type_id: typeId, key, label,
    kind: (kind === 'photo' ? 'text' : kind) as FieldKind,
    options: kind === 'choice' ? options : null,
    multiple: kind === 'choice' && multiple,
    required: required && kind !== 'photo',
    sort_order: Math.max(0, ...(existing ?? []).map((f) => f.sort_order)) + 10,
  });
  if (error) return fail('Couldn’t add it.');
  done();
  return { ok: true, message: `${label} added.` };
}

export async function updateField(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await asParent();
  const id = clean(form.get('field_id'), 40);
  const label = sentence(clean(form.get('label'), 40));
  const required = form.get('required') === 'on';
  const { data: f } = await supabase.from('field_defs').select('*').eq('id', id).single();
  if (!f) return fail('Not found.');
  if (!label) return fail('Give the detail a name.');
  const patch: Record<string, unknown> = { label };

  if (f.kind === 'choice') {
    const options = optionsFrom(String(form.get('options') ?? ''));
    if (options.length < 2) return fail('Keep at least two answers to pick from.');
    for (const gone of ((f.options as string[]) ?? []).filter((o) => !options.includes(o))) {
      const { data: n } = await supabase.rpc('field_usage', { p_field: id, p_option: gone });
      if (n) return fail(`${n} ${n === 1 ? 'thing has' : 'things have'} “${gone}”, so it has to stay. Change ${n === 1 ? 'it' : 'them'} first.`);
    }
    patch.options = options;
    const multiple = form.get('multiple') === 'on';
    if (f.multiple && !multiple) {
      const { data: rows } = await supabase.rpc('field_usage', { p_field: id });
      if (rows) return fail('Things may already have several answers picked, so this stays “pick several”.');
    }
    patch.multiple = multiple;
  }

  if (required && !f.required && f.key !== 'photo') {
    const [{ data: total }, { data: filled }] = await Promise.all([
      supabase.rpc('kind_usage', { p_type: f.object_type_id }),
      supabase.rpc('field_usage', { p_field: id }),
    ]);
    if ((total ?? 0) > (filled ?? 0)) return fail(`${(total ?? 0) - (filled ?? 0)} things don’t have it yet, so it can’t be a must-have.`);
    patch.required = true;
  } else if (!required) patch.required = false;

  const { error } = await supabase.from('field_defs').update(patch as never).eq('id', id);
  if (error) return fail('Couldn’t save it.');
  done();
  return { ok: true, message: 'Saved.' };
}

export async function removeField(fieldId: string): Promise<ActionResult> {
  const { supabase } = await asParent();
  const { data: f } = await supabase.from('field_defs').select('key, object_type_id').eq('id', fieldId).single();
  if (!f) return fail('Not found.');
  const { data: type } = await supabase.from('object_types').select('name').eq('id', f.object_type_id).single();
  if (type && isLockedField(type.name, f.key)) return fail('The app relies on this detail, so it stays.');
  const { data: n, error } = await supabase.rpc('remove_field', { p_field: fieldId });
  if (error) return fail('Couldn’t remove it.');
  done();
  return { ok: true, message: n ? `Removed, and cleared from ${n} ${n === 1 ? 'thing' : 'things'}.` : 'Removed.' };
}

export async function fieldUsage(fieldId: string): Promise<number> {
  const { supabase } = await asParent();
  const { data } = await supabase.rpc('field_usage', { p_field: fieldId });
  return data ?? 0;
}
