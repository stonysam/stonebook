-- Milestone 4: Benji mode on a family tablet.
-- The tablet stays signed in as a parent. Benji ticks chores off with his own 4-digit PIN;
-- either parent's PIN takes the tablet out of Benji mode. PINs are salted hashes in
-- member_pins (server-only); five wrong tries lock that PIN for 15 minutes.

alter table public.member_pins add column salt text not null default replace(gen_random_uuid()::text, '-', '');
alter table public.member_pins add column failed_attempts int not null default 0;
alter table public.member_pins add column locked_until timestamptz;

create or replace function app.pin_hash(p_salt text, p_pin text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_salt || ':' || p_pin, 'UTF8')), 'hex')
$$;

-- A parent sets their own PIN, or a child's.
create or replace function public.set_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if not app.is_parent() then raise exception 'Only Mum or Dad can set PINs'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'A PIN is 4 digits'; end if;
  if p_member <> app.my_id() and not exists (select 1 from public.members where id = p_member and role = 'child') then
    raise exception 'You can set your own PIN or a child''s';
  end if;
  insert into public.member_pins (member_id, pin_hash, salt, updated_at, failed_attempts, locked_until)
  values (p_member, app.pin_hash(v_salt, p_pin), v_salt, now(), 0, null)
  on conflict (member_id) do update
    set pin_hash = excluded.pin_hash, salt = excluded.salt, updated_at = now(), failed_attempts = 0, locked_until = null;
end $$;

-- Which of the family have a PIN set (yes or no only), for the settings screen.
create or replace function public.pins_set() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.member_id from public.member_pins p
   where app.is_parent() and (p.member_id = app.my_id() or exists (select 1 from public.members m where m.id = p.member_id and m.role = 'child'))
$$;

-- Checks one person's PIN: 'ok', 'wrong', 'locked' or 'none'. Counts wrong tries.
create or replace function app.check_pin(p_member uuid, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare p public.member_pins;
begin
  select * into p from public.member_pins where member_id = p_member for update;
  if not found then return 'none'; end if;
  if p.locked_until is not null and p.locked_until > now() then return 'locked'; end if;
  if p_pin ~ '^[0-9]{4}$' and app.pin_hash(p.salt, p_pin) = p.pin_hash then
    update public.member_pins set failed_attempts = 0, locked_until = null where member_id = p_member;
    return 'ok';
  end if;
  update public.member_pins
     set failed_attempts = case when p.failed_attempts + 1 >= 5 then 0 else p.failed_attempts + 1 end,
         locked_until = case when p.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
   where member_id = p_member;
  return case when p.failed_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

-- Benji ticks off a chore on the family tablet (signed in as a parent). It's saved as his,
-- and waits for a parent's OK like any kid's chore.
create or replace function public.child_log(p_child uuid, p_pin text, p_object uuid, p_rule uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result text;
  v_kind text;
  v_event public.events;
begin
  if not app.is_parent() then raise exception 'Only on a family tablet'; end if;
  if not exists (select 1 from public.members where id = p_child and role = 'child') then raise exception 'Not a child'; end if;
  if not exists (
    select 1 from public.objects o
     where o.id = p_object and o.archived_at is null
       and (o.owner_id = p_child or exists (select 1 from public.rules r where r.object_id = o.id and r.owner_id = p_child and r.active))
  ) then raise exception 'Not one of their chores'; end if;
  if p_rule is not null and not exists (select 1 from public.rules where id = p_rule and object_id = p_object) then
    raise exception 'That reminder belongs to a different item';
  end if;

  v_result := app.check_pin(p_child, p_pin);
  if v_result <> 'ok' then return jsonb_build_object('result', v_result); end if;

  v_kind := coalesce((select event_kind from public.rules where id = p_rule), 'Done');
  insert into public.events (object_id, kind, occurred_on, created_by, rule_id)
  values (p_object, v_kind, (now() at time zone 'Europe/Prague')::date, p_child, p_rule)
  returning * into v_event;
  return jsonb_build_object('result', 'ok', 'waiting', v_event.needs_confirmation);
end $$;

-- Leaving Benji mode: either parent's PIN. Wrong tries count against every parent's PIN.
create or replace function public.check_parent_pin(p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.member_pins;
  v_any boolean := false;
  v_open boolean := false;
begin
  if not app.is_parent() then raise exception 'Only on a family tablet'; end if;
  for p in select mp.* from public.member_pins mp join public.members m on m.id = mp.member_id where m.role = 'parent' for update of mp loop
    v_any := true;
    if p.locked_until is not null and p.locked_until > now() then continue; end if;
    v_open := true;
    if p_pin ~ '^[0-9]{4}$' and app.pin_hash(p.salt, p_pin) = p.pin_hash then
      update public.member_pins set failed_attempts = 0, locked_until = null where member_id = p.member_id;
      return 'ok';
    end if;
  end loop;
  if not v_any then return 'none'; end if;
  if not v_open then return 'locked'; end if;
  update public.member_pins mp
     set failed_attempts = case when mp.failed_attempts + 1 >= 5 then 0 else mp.failed_attempts + 1 end,
         locked_until = case when mp.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else mp.locked_until end
    from public.members m
   where m.id = mp.member_id and m.role = 'parent' and (mp.locked_until is null or mp.locked_until <= now());
  return 'wrong';
end $$;

-- A simple picture for each chore, so Benji can read his list at a glance.
insert into public.field_defs (object_type_id, key, label, kind, options, required, sort_order)
select t.id, 'picture', 'Picture (for younger kids)', 'choice',
       '["hens","eggs","dog","cat","bin","dishes","table","bed","toys","laundry","plants","teeth","book","broom","logs","star"]'::jsonb, false, 5
  from public.object_types t where t.name = 'Chore or task'
on conflict (object_type_id, key) do nothing;

revoke all on function public.set_pin(uuid, text), public.pins_set(), public.child_log(uuid, text, uuid, uuid),
  public.check_parent_pin(text), app.check_pin(uuid, text), app.pin_hash(text, text) from public, anon;
grant execute on function public.set_pin(uuid, text), public.pins_set(), public.child_log(uuid, text, uuid, uuid),
  public.check_parent_pin(text) to authenticated;
revoke all on function app.check_pin(uuid, text), app.pin_hash(text, text) from authenticated;
