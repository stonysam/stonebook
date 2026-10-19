import { getMe } from '@/lib/auth';

const BUCKET = 'photos';
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Short-lived links to show photos; storage only signs files the person may see. */
export async function photoUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return {};
  const { supabase } = await getMe();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(list, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}

/** Stores a photo the app has already shrunk, under the item's id. Returns its path. */
export async function savePhoto(objectId: string, file: FormDataEntryValue | null): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.type !== 'image/jpeg' || file.size > MAX_PHOTO_BYTES) return { error: 'That photo didn’t work. Try another one.' };
  const { supabase } = await getMe();
  const path = `${objectId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false });
  return error ? { error: 'The photo didn’t upload. Try again.' } : { path };
}

export async function removePhoto(path: string | null | undefined) {
  if (!path) return;
  const { supabase } = await getMe();
  await supabase.storage.from(BUCKET).remove([path]);
}
