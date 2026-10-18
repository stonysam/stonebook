// Both values are public by design (they ship to every browser); row-level security protects the data.
// Environment variables override them, e.g. for a local Supabase stack.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qiddytmxiftsvmwoisuc.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_GZ1mtZdWoe6cUOFsxz602w_50I4LLHB';
