-- Family Tracker: foundation schema (milestone 1)
--
-- Design rules
--   * Events are an append-only ledger. "Next due" is derived from events + rules,
--     never stored as editable state.
--   * Visibility is enforced here with row-level security, not in the app screens.
--   * Only people on the members allow-list can do anything.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('parent', 'member', 'junior', 'child');
-- shared:   whole family
-- personal: owner + both parents (optionally switched to whole family)
-- private:  owner only, hidden from parents too; only the owner can make an item private
create type public.visibility  as enum ('shared', 'personal', 'private');
create type public.field_kind  as enum ('text', 'number', 'date', 'choice', 'person');
create type public.rule_kind   as enum ('interval', 'meter', 'fixed_date', 'record');

-- ---------------------------------------------------------------------------
-- Members (the allow-list)
-- ---------------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (length(trim(display_name)) > 0),
  role          public.member_role not null,
  email         text unique,             -- Google account allowed to claim this member
  auth_user_id  uuid unique,             -- set on first sign-in by app.claim_membership()
  created_at    timestamptz not null default now(),
  constraint child_has_no_login check (role <> 'child' or (email is null and auth_user_id is null)),
  constraint login_needs_email  check (auth_user_id is null or email is not null)
);

-- Child PIN hashes live apart from members: every family member can read members, and a
-- 4-digit PIN can be brute-forced from its hash in moments. RLS on, no policies = only the
-- server (service role) can read or write this table.
create table public.member_pins (
  member_id  uuid primary key references public.members(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table public.member_pins enable row level security;
revoke all on public.member_pins from anon, authenticated;  -- Supabase grants new tables by default

-- ---------------------------------------------------------------------------
-- Session helpers. SECURITY DEFINER so they can read members without
-- tripping the members RLS policies (avoids policy recursion).
-- ---------------------------------------------------------------------------
create or replace function app.my_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where auth_user_id = auth.uid()
$$;

create or replace function app.my_role() returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.members where auth_user_id = auth.uid()
$$;

create or replace function app.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() = 'parent', false)
$$;

-- Links the signed-in Google account to its member row, matched by email.
-- Returns the member id, or null if the email is not on the allow-list.
create or replace function app.claim_membership() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  claimed uuid;
  jwt_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or jwt_email is null then
    return null;
  end if;
  update public.members
     set auth_user_id = auth.uid()
   where lower(email) = jwt_email
     and auth_user_id is null
  returning id into claimed;
  return coalesce(claimed, app.my_id());
end $$;

-- ---------------------------------------------------------------------------
-- Object types and their fields (editable by parents, no code needed)
-- ---------------------------------------------------------------------------
create table public.object_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  icon        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.field_defs (
  id              uuid primary key default gen_random_uuid(),
  object_type_id  uuid not null references public.object_types(id) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label           text not null,
  kind            public.field_kind not null,
  options         jsonb,                 -- choice fields: JSON array of strings
  required        boolean not null default false,
  sort_order      int not null default 0,
  unique (object_type_id, key),
  constraint choice_needs_options check (
    (kind = 'choice') = (options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0)
  )
);

-- ---------------------------------------------------------------------------
-- Objects: one real thing (the Škoda, the sheep flock, a passport, a bill)
-- ---------------------------------------------------------------------------
create table public.objects (
  id                 uuid primary key default gen_random_uuid(),
  object_type_id     uuid not null references public.object_types(id),
  name               text not null check (length(trim(name)) > 0),
  owner_id           uuid not null references public.members(id),
  visibility         public.visibility not null default 'shared',
  share_with_family  boolean not null default false,  -- personal items only: the "share with siblings/kids" switch
  field_values       jsonb not null default '{}'::jsonb,
  archived_at        timestamptz,
  created_by         uuid references public.members(id),
  created_at         timestamptz not null default now(),
  constraint share_only_personal check (visibility = 'personal' or share_with_family = false)
);
create index objects_owner_idx on public.objects(owner_id);
create index objects_type_idx  on public.objects(object_type_id);

-- Checks field_values against the type's field definitions.
create or replace function app.validate_field_values() returns trigger
language plpgsql set search_path = public as $$
declare
  k text;
  v jsonb;
  d public.field_defs;
begin
  if jsonb_typeof(new.field_values) <> 'object' then
    raise exception 'field_values must be a JSON object';
  end if;

  for k, v in select * from jsonb_each(new.field_values) loop
    select * into d from public.field_defs where object_type_id = new.object_type_id and key = k;
    if not found then
      raise exception 'Unknown field "%" for this object type', k;
    end if;
    continue when v = 'null'::jsonb;

    if d.kind = 'text' and jsonb_typeof(v) <> 'string' then
      raise exception '% must be text', d.label;
    elsif d.kind = 'number' and jsonb_typeof(v) <> 'number' then
      raise exception '% must be a number', d.label;
    elsif d.kind = 'date' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '% must be a date (YYYY-MM-DD)', d.label;
      end if;
      perform (v #>> '{}')::date;  -- rejects impossible dates such as 2026-02-30
    elsif d.kind = 'choice' and (jsonb_typeof(v) <> 'string' or not (d.options ? (v #>> '{}'))) then
      raise exception '% must be one of %', d.label, d.options;
    elsif d.kind = 'person' then
      if jsonb_typeof(v) <> 'string'
         or (v #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.members m where m.id = (v #>> '{}')::uuid) then
        raise exception '% must be a family member', d.label;
      end if;
    end if;
  end loop;

  for d in select * from public.field_defs where object_type_id = new.object_type_id and required loop
    if not (new.field_values ? d.key) or new.field_values -> d.key = 'null'::jsonb then
      raise exception '% is required', d.label;
    end if;
  end loop;

  return new;
end $$;

-- created_by is stamped by the database, never trusted from the app, and never changes.
-- It decides who may make an item private (only its creator, if they also own it).
create or replace function app.stamp_created_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(app.my_id(), new.created_by);  -- seeds/admin scripts have no signed-in user
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create trigger objects_stamp_created_by
  before insert or update on public.objects
  for each row execute function app.stamp_created_by();

create trigger objects_validate_fields
  before insert or update of field_values, object_type_id on public.objects
  for each row execute function app.validate_field_values();

-- ---------------------------------------------------------------------------
-- Events: the append-only ledger of what happened to each object
-- ---------------------------------------------------------------------------
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  object_id      uuid not null references public.objects(id),
  kind           text not null check (length(trim(kind)) > 0),   -- "oil change", "sheared", "paid", "reading"
  occurred_on    date not null,
  meter_value    numeric check (meter_value is null or meter_value >= 0),
  meter_unit     text,
  data           jsonb not null default '{}'::jsonb,  -- e.g. {"next_due":"2036-05-01"}, {"covers":"2026-11-15"}, {"amount":1200}
  note           text,
  correction_of  uuid unique references public.events(id),  -- this entry replaces that one
  voided         boolean not null default false,            -- a correction that cancels the original
  created_by     uuid references public.members(id),
  created_at     timestamptz not null default now(),
  constraint meter_unit_with_value check ((meter_value is null) = (meter_unit is null)),
  constraint void_is_correction    check (not voided or correction_of is not null),
  constraint data_is_object        check (jsonb_typeof(data) = 'object')
);
create index events_object_idx on public.events(object_id, occurred_on desc);

create or replace function app.forbid_event_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Events are append-only. Record a correction instead.';
end $$;

create trigger events_append_only
  before update or delete on public.events
  for each row execute function app.forbid_event_change();

create or replace function app.check_correction() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.correction_of is not null and not exists (
    select 1 from public.events e where e.id = new.correction_of and e.object_id = new.object_id
  ) then
    raise exception 'A correction must refer to an event on the same object';
  end if;
  return new;
end $$;

create trigger events_check_correction
  before insert on public.events
  for each row execute function app.check_correction();

-- The events that currently count: originals not replaced, plus non-void corrections.
create view public.effective_events with (security_invoker = true) as
  select e.*
    from public.events e
   where not e.voided
     and not exists (select 1 from public.events c where c.correction_of = e.id);

-- ---------------------------------------------------------------------------
-- Rules: how the next due date is worked out
-- ---------------------------------------------------------------------------
create table public.rules (
  id                  uuid primary key default gen_random_uuid(),
  object_id           uuid not null references public.objects(id),
  name                text not null,
  kind                public.rule_kind not null,
  event_kind          text,               -- which events satisfy the rule; null for 'record'
  every_months        int  check (every_months > 0),
  every_days          int  check (every_days > 0),
  meter_every         numeric check (meter_every > 0),
  meter_unit          text,
  due_on              date,               -- fixed_date: first/anchor due date
  renew_every_months  int  check (renew_every_months > 0),  -- fixed_date: repeats on this schedule
  starts_on           date,               -- interval: baseline if nothing logged yet
  meter_start         numeric,            -- meter: baseline reading if no service logged yet
  owner_id            uuid not null references public.members(id),
  lead_days           int[] not null default '{14,1}',
  overdue_repeat_days int not null default 7 check (overdue_repeat_days > 0),
  active              boolean not null default true,
  created_by          uuid references public.members(id),
  created_at          timestamptz not null default now(),
  constraint event_kind_needed check ((kind = 'record') = (event_kind is null)),
  constraint interval_shape check (kind <> 'interval' or every_months is not null or every_days is not null),
  constraint meter_shape check (kind <> 'meter' or (meter_every is not null and meter_unit is not null)),
  constraint meter_pair check ((meter_every is null) = (meter_unit is null)),
  constraint fixed_shape check (kind <> 'fixed_date' or due_on is not null),
  constraint lead_days_positive check (0 < all(lead_days))
);
create index rules_object_idx on public.rules(object_id);
create index rules_owner_idx  on public.rules(owner_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.members      enable row level security;
alter table public.object_types enable row level security;
alter table public.field_defs   enable row level security;
alter table public.objects      enable row level security;
alter table public.events       enable row level security;
alter table public.rules        enable row level security;

-- Who can see an object:
--   private items: their owner only, nobody else (parents included)
--   parents: everything else
--   member/junior: shared items, their own items, personal items switched to "share with family"
--   child: nothing directly (child actions go through the family-device flow, milestone 4)
create or replace function app.can_see_object(o_owner uuid, o_vis public.visibility, o_shared boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.my_role() is null      then false
    when o_vis = 'private'          then o_owner = app.my_id()
    when app.my_role() = 'parent'   then true
    when app.my_role() = 'child'    then false
    when o_vis = 'shared'           then true
    when o_owner = app.my_id()      then true
    else o_shared
  end
$$;

-- members: every signed-in family member can see the family list; parents manage it
create policy members_read  on public.members for select using (app.my_role() is not null);
create policy members_write on public.members for all    using (app.is_parent()) with check (app.is_parent());

-- object types and fields: readable by the family; parents edit
create policy types_read   on public.object_types for select using (app.my_role() is not null);
create policy types_write  on public.object_types for all    using (app.is_parent()) with check (app.is_parent());
create policy fields_read  on public.field_defs   for select using (app.my_role() is not null);
create policy fields_write on public.field_defs   for all    using (app.is_parent()) with check (app.is_parent());

-- objects
create policy objects_read on public.objects for select
  using (app.can_see_object(owner_id, visibility, share_with_family));

-- Parents create anything; members and juniors create items they own (homework, school, their own stuff).
-- Only someone who created and owns an item can make it private, so a chore a parent
-- assigns can't be hidden from parents.
create policy objects_insert on public.objects for insert
  with check (
    (app.is_parent() or (app.my_role() in ('member', 'junior') and owner_id = app.my_id()))
    and (visibility <> 'private' or (owner_id = app.my_id() and created_by = app.my_id()))
  );

create policy objects_update on public.objects for update
  using (
    app.can_see_object(owner_id, visibility, share_with_family)
    and (app.is_parent() or (app.my_role() in ('member', 'junior') and owner_id = app.my_id()))
  )
  with check (
    (app.is_parent() or (app.my_role() in ('member', 'junior') and owner_id = app.my_id()))
    and (visibility <> 'private' or (owner_id = app.my_id() and created_by = app.my_id()))
  );
-- No delete policy: objects are archived (archived_at), never deleted, so their history survives.

-- events: anyone signed in except a child can log on objects they can see
create policy events_read on public.events for select
  using (exists (select 1 from public.objects o where o.id = object_id));

create policy events_insert on public.events for insert
  with check (
    app.my_role() in ('parent', 'member', 'junior')
    and created_by = app.my_id()
    and exists (select 1 from public.objects o where o.id = object_id and o.archived_at is null)
  );
-- No update/delete policies, and the append-only trigger blocks them for every role.

-- rules: visible with their object; parents, or the owner of the object, manage them.
-- The exists() subquery runs under objects RLS, so nobody can attach a rule to an item they can't see.
create policy rules_read on public.rules for select
  using (exists (select 1 from public.objects o where o.id = object_id));

create policy rules_insert on public.rules for insert
  with check (
    exists (select 1 from public.objects o
             where o.id = object_id
               and (app.is_parent() or (app.my_role() in ('member', 'junior') and o.owner_id = app.my_id())))
  );

create policy rules_update on public.rules for update
  using (
    exists (select 1 from public.objects o
             where o.id = object_id
               and (app.is_parent() or (app.my_role() in ('member', 'junior') and o.owner_id = app.my_id())))
  )
  with check (
    exists (select 1 from public.objects o
             where o.id = object_id
               and (app.is_parent() or (app.my_role() in ('member', 'junior') and o.owner_id = app.my_id())))
  );
-- No delete policy: rules are switched off (active = false).

-- ---------------------------------------------------------------------------
-- Grants (Supabase's signed-in role)
-- ---------------------------------------------------------------------------
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select on public.effective_events to authenticated;
grant select, insert, update on public.members, public.object_types, public.field_defs,
                               public.objects, public.rules to authenticated;
grant delete on public.members, public.object_types, public.field_defs to authenticated;
grant select, insert on public.events to authenticated;
