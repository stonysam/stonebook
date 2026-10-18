import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { MemberRow } from '@/lib/database.types';

/**
 * The signed-in family member, once per request. Sends anyone not signed in to
 * /login and anyone not on the family list to /not-on-list.
 */
export const getMe = cache(async (): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; me: MemberRow }> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');

  const { data: memberId } = await supabase.rpc('claim_membership');
  if (!memberId) redirect('/not-on-list');

  const { data: me } = await supabase.from('members').select('*').eq('id', memberId).single();
  if (!me) redirect('/not-on-list');
  return { supabase, me };
});

export const isParent = (m: MemberRow) => m.role === 'parent';
export const isKid = (m: MemberRow) => m.role === 'junior' || m.role === 'child';
