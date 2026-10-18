-- Pin the search path on the feed helper (Supabase security advisor 0011).
alter function app.is_family_wide(public.objects) set search_path = public;
