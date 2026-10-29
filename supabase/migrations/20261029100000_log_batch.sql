-- 29 Oct batch: the Log page, chores that log to an item, activities kept in the Log,
-- and how long each person keeps entries in their Feed.

-- A chore or task with "Log details" is recorded against another item (feeding the hens
-- goes into the hens' history). Its entries are written on that item, naming the chore's reminder.
alter table public.rules add column logs_to uuid references public.objects(id);
create index rules_logs_to_idx on public.rules(logs_to);

-- Activities show in the Log only when they were set up to keep one.
alter table public.objects add column keep_log boolean not null default false;

-- How many days entries stay in each person's Feed (their history stays).
alter table public.members add column feed_days int not null default 14 check (feed_days between 1 and 365);

create or replace function public.set_feed_days(p_days int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app.my_id() is null then raise exception 'Not signed in'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Pick between 1 and 365 days'; end if;
  update public.members set feed_days = p_days where id = app.my_id();
end $$;
revoke execute on function public.set_feed_days(int) from public, anon;
grant execute on function public.set_feed_days(int) to authenticated;

update public.object_types set name = 'Activities' where name = 'Activity or work';

-- An entry may name a reminder on its own item, or a chore's reminder that logs to this item.
create or replace function app.stamp_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.root_id := coalesce((select e.root_id from public.events e where e.id = new.correction_of), new.id);
  -- A fix keeps the turn of the entry it replaces unless it names one.
  if new.correction_of is not null and new.rule_id is null then
    new.rule_id := (select e.rule_id from public.events e where e.id = new.correction_of);
  end if;
  if new.rule_id is not null and not exists (
    select 1 from public.rules r where r.id = new.rule_id and (r.object_id = new.object_id or r.logs_to = new.object_id)
  ) then
    raise exception 'That reminder belongs to a different item';
  end if;
  new.needs_confirmation := exists (
    select 1
      from public.objects o
      join public.object_types t on t.id = o.object_type_id
      join public.members logger on logger.id = new.created_by
     where o.id = new.object_id
       and t.confirm_kid_logs
       and o.visibility <> 'private'
       and logger.role in ('junior', 'child')
       and o.created_by is distinct from new.created_by
  );
  return new;
end $$;

-- Benji's tablet: a chore that logs to an item writes into that item's history; a plain
-- chore's tick is marked as a Done tap (kept out of the Log).
create or replace function public.child_log(p_child uuid, p_pin text, p_object uuid, p_rule uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result text;
  v_kind text;
  v_target uuid;
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

  select coalesce(r.event_kind, 'Done'), r.logs_to into v_kind, v_target from public.rules r where r.id = p_rule;
  insert into public.events (object_id, kind, occurred_on, created_by, rule_id, data)
  values (coalesce(v_target, p_object), coalesce(v_kind, 'Done'), (now() at time zone 'Europe/Prague')::date, p_child, p_rule,
          case when v_target is null then '{"quick": true}'::jsonb else '{}'::jsonb end)
  returning * into v_event;
  return jsonb_build_object('result', 'ok', 'waiting', v_event.needs_confirmation);
end $$;
