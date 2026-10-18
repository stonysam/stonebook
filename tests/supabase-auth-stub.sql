-- Test-only stand-in for the parts of Supabase the migrations rely on.
-- In Supabase, auth.uid() and auth.jwt() read the signed-in user's token; here they
-- read session settings so tests can "sign in" as any family member.
create schema if not exists auth;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;

-- Mimic Supabase's default: new public tables are granted to the API roles.
alter default privileges in schema public grant all on tables to anon, authenticated;
