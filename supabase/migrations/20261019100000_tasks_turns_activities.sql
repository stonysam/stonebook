-- 19 Oct: chores become "chores and tasks" anyone can hand out, chores can rotate between
-- people (each turn is its own reminder, and an entry can say which turn it was), and
-- activities or work with weekly times and who drives.

-- ---------------------------------------------------------------------------
-- Chores and tasks
-- ---------------------------------------------------------------------------
alter table public.object_types add column assignable boolean not null default false;
comment on column public.object_types.assignable is
  'Anyone with a login may give items of this type to anyone (chores and tasks).';

update public.object_types set name = 'Chore or task', assignable = true where name = 'Chore';

-- Who may change an item and its reminders: parents; the owner (members and juniors);
-- and for chores and tasks, whoever handed it out.
create or replace function app.manages_object(o_owner uuid, o_creator uuid, o_type uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_parent()
      or (app.my_role() in ('member', 'junior')
          and (o_owner = app.my_id()
               or (o_creator = app.my_id()
                   and exists (select 1 from public.object_types t where t.id = o_type and t.assignable))))
$$;

-- A member or junior may create an item for someone else only if it's a chore or task,
-- and then only a shared one, so the person who handed it out can still see it.
drop policy objects_insert on public.objects;
create policy objects_insert on public.objects for insert
  with check (
    (app.is_parent()
     or (app.my_role() in ('member', 'junior')
         and (owner_id = app.my_id()
              or (visibility = 'shared'
                  and exists (select 1 from public.object_types t where t.id = object_type_id and t.assignable)))))
    and (visibility <> 'private' or (owner_id = app.my_id() and created_by = app.my_id()))
  );

drop policy objects_update on public.objects;
create policy objects_update on public.objects for update
  using (app.can_see_object(owner_id, visibility, share_with_family)
         and app.manages_object(owner_id, created_by, object_type_id))
  with check (app.manages_object(owner_id, created_by, object_type_id)
              and (visibility <> 'private' or (owner_id = app.my_id() and created_by = app.my_id())));

drop policy rules_insert on public.rules;
create policy rules_insert on public.rules for insert
  with check (exists (select 1 from public.objects o
                       where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));

drop policy rules_update on public.rules;
create policy rules_update on public.rules for update
  using (exists (select 1 from public.objects o
                  where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)))
  with check (exists (select 1 from public.objects o
                       where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));

-- ---------------------------------------------------------------------------
-- Turns: an entry can say which reminder it was for (dishes: Marley's Tuesday turn)
-- ---------------------------------------------------------------------------
alter table public.events add column rule_id uuid references public.rules(id);
create index events_rule_idx on public.events(rule_id) where rule_id is not null;

create or replace function app.stamp_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.root_id := coalesce((select e.root_id from public.events e where e.id = new.correction_of), new.id);
  -- A fix keeps the turn of the entry it replaces unless it names one.
  if new.correction_of is not null and new.rule_id is null then
    new.rule_id := (select e.rule_id from public.events e where e.id = new.correction_of);
  end if;
  if new.rule_id is not null and not exists (
    select 1 from public.rules r where r.id = new.rule_id and r.object_id = new.object_id
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

-- The view lists columns as they were when it was made, so it's rebuilt to include rule_id.
create or replace view public.effective_events with (security_invoker = true) as
  select e.*
    from public.events e
   where not e.voided
     and not exists (select 1 from public.events c where c.correction_of = e.id)
     and (not e.needs_confirmation
          or exists (select 1 from public.confirmations k where k.event_id = e.id and k.approved));

-- ---------------------------------------------------------------------------
-- Activities and work: weekly times, who drops off and picks up
-- ---------------------------------------------------------------------------
insert into public.object_types (name, icon, sort_order, confirm_kid_logs, assignable)
values ('Activity or work', 'calendar', 15, false, false)
on conflict (name) do nothing;

insert into public.field_defs (object_type_id, key, label, kind, required, sort_order)
select t.id, f.key, f.label, 'text'::public.field_kind, false, f.sort_order
  from public.object_types t,
       (values ('place', 'Where', 10), ('contact', 'Contact (leader, coach, manager)', 20)) as f(key, label, sort_order)
 where t.name = 'Activity or work'
on conflict (object_type_id, key) do nothing;

create table public.activity_slots (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references public.objects(id),
  weekdays     smallint[] not null,
  starts_at    time not null,
  ends_at      time,
  drop_off_by  uuid references public.members(id),
  pick_up_by   uuid references public.members(id),
  active       boolean not null default true,
  created_by   uuid references public.members(id),
  created_at   timestamptz not null default now(),
  constraint slot_weekdays check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  constraint slot_times check (ends_at is null or ends_at > starts_at)
);
create index activity_slots_object_idx on public.activity_slots(object_id);

create trigger activity_slots_stamp_created_by
  before insert or update on public.activity_slots
  for each row execute function app.stamp_created_by();

-- One date's change: someone else drives, or it's off that week.
create table public.activity_changes (
  slot_id      uuid not null references public.activity_slots(id),
  on_date      date not null,
  cancelled    boolean not null default false,
  drop_off_by  uuid references public.members(id),
  pick_up_by   uuid references public.members(id),
  note         text check (length(note) <= 300),
  changed_by   uuid references public.members(id),
  changed_at   timestamptz not null default now(),
  primary key (slot_id, on_date)
);

create or replace function app.stamp_activity_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.changed_by := coalesce(app.my_id(), new.changed_by);
  new.changed_at := now();
  if not exists (select 1 from public.activity_slots s
                  where s.id = new.slot_id and extract(isodow from new.on_date)::smallint = any(s.weekdays)) then
    raise exception 'That date isn''t one of its days';
  end if;
  return new;
end $$;

create trigger activity_changes_stamp
  before insert or update on public.activity_changes
  for each row execute function app.stamp_activity_change();

alter table public.activity_slots   enable row level security;
alter table public.activity_changes enable row level security;

-- Seen with the item. Changed by the person it belongs to or a parent.
create policy slots_read on public.activity_slots for select
  using (exists (select 1 from public.objects o where o.id = object_id));
create policy slots_write on public.activity_slots for insert
  with check (exists (select 1 from public.objects o
                       where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));
create policy slots_update on public.activity_slots for update
  using (exists (select 1 from public.objects o
                  where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)))
  with check (exists (select 1 from public.objects o
                       where o.id = object_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));

create policy changes_read on public.activity_changes for select
  using (exists (select 1 from public.activity_slots s where s.id = slot_id));
create policy changes_insert on public.activity_changes for insert
  with check (exists (select 1 from public.activity_slots s join public.objects o on o.id = s.object_id
                       where s.id = slot_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));
create policy changes_update on public.activity_changes for update
  using (exists (select 1 from public.activity_slots s join public.objects o on o.id = s.object_id
                  where s.id = slot_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)))
  with check (exists (select 1 from public.activity_slots s join public.objects o on o.id = s.object_id
                       where s.id = slot_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));
create policy changes_delete on public.activity_changes for delete
  using (exists (select 1 from public.activity_slots s join public.objects o on o.id = s.object_id
                  where s.id = slot_id and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.activity_slots, public.activity_changes from anon, authenticated;
revoke all on function app.manages_object(uuid, uuid, uuid), app.stamp_activity_change() from public, anon;
grant execute on function app.manages_object(uuid, uuid, uuid) to authenticated;
grant select on public.effective_events to authenticated;
grant select, insert, update on public.activity_slots to authenticated;
grant select, insert, update, delete on public.activity_changes to authenticated;
