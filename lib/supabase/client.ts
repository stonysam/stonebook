import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './env';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  );
}
