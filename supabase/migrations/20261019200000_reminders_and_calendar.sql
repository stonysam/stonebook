-- Milestone 3: phone reminders (Web Push) and a private calendar link per person.

-- ---------------------------------------------------------------------------
-- Phones that want reminders. One row per browser/phone; a phone signed in as
-- someone else takes the row over.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  endpoint    text primary key check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  member_id   uuid not null references public.members(id),
  p256dh      text not null check (length(p256dh) <= 200),
  auth        text not null check (length(auth) <= 100),
  device      text check (length(device) <= 120),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_member_idx on public.push_subscriptions(member_id);
alter table public.push_subscriptions enable row level security;

create policy push_read_own on public.push_subscriptions for select using (member_id = app.my_id());
create policy push_delete_own on public.push_subscriptions for delete using (member_id = app.my_id());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app.my_id() is null or app.my_role() = 'child' then
    raise exception 'Not signed in';
  end if;
  insert into public.push_subscriptions (endpoint, member_id, p256dh, auth, device)
  values (p_endpoint, app.my_id(), p_p256dh, p_auth, left(p_device, 120))
  on conflict (endpoint) do update
    set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device = excluded.device, created_at = now();
end $$;

-- What has gone out, so the sender (every 15 minutes) never sends the same thing twice.
-- Only the sender (service role) uses it.
create table public.notification_log (
  member_id  uuid not null references public.members(id),
  key        text not null,
  sent_at    timestamptz not null default now(),
  primary key (member_id, key)
);
alter table public.notification_log enable row level security;

-- ---------------------------------------------------------------------------
-- Private calendar links. The token in the link is the only key, so it's long and
-- random, and the owner can replace it (the old link then stops working).
-- Kept readable by its owner so the app can show the link again.
-- ---------------------------------------------------------------------------
create table public.calendar_links (
  member_id   uuid primary key references public.members(id),
  token       text not null unique check (length(token) >= 48),
  created_at  timestamptz not null default now()
);
alter table public.calendar_links enable row level security;
create policy calendar_read_own on public.calendar_links for select using (member_id = app.my_id());

create or replace function public.calendar_link_reset() returns text
language plpgsql security definer set search_path = public as $$
declare v text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if app.my_id() is null or app.my_role() = 'child' then
    raise exception 'Not signed in';
  end if;
  insert into public.calendar_links (member_id, token) values (app.my_id(), v)
  on conflict (member_id) do update set token = excluded.token, created_at = now();
  return v;
end $$;

-- The same visibility rules as app.can_see_object, for a given person rather than the signed-in one.
create or replace function app.can_see_as(m_id uuid, m_role public.member_role, o_owner uuid, o_vis public.visibility, o_shared boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when m_id is null           then false
    when o_vis = 'private'      then o_owner = m_id
    when m_role = 'parent'      then true
    when m_role = 'child'       then false
    when o_vis = 'shared'       then true
    when o_owner = m_id         then true
    else o_shared
  end
$$;

-- What a calendar app may read with a link: only what that person could see in the app,
-- and only the columns the calendar needs (no notes, no item details).
create or replace function public.calendar_data(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.members;
begin
  if p_token is null or length(p_token) < 48 then return null; end if;
  select m.* into me from public.calendar_links l join public.members m on m.id = l.member_id where l.token = p_token;
  if not found then return null; end if;

  return (
    with obj as (
      select o.id, o.name, o.owner_id, o.object_type_id, o.archived_at, o.created_by
        from public.objects o
       where o.archived_at is null and app.can_see_as(me.id, me.role, o.owner_id, o.visibility, o.share_with_family)
    )
    select jsonb_build_object(
      'member_id', me.id,
      'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'role', m.role)), '[]') from public.members m),
      'objects', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from obj o),
      'types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'assignable', t.assignable)), '[]') from public.object_types t),
      'rules', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.rules r where r.active and r.object_id in (select id from obj)),
      'events', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', e.id, 'object_id', e.object_id, 'kind', e.kind, 'occurred_on', e.occurred_on, 'meter_value', e.meter_value,
                   'meter_unit', e.meter_unit, 'data', e.data, 'created_by', e.created_by, 'created_at', e.created_at, 'rule_id', e.rule_id)), '[]')
                   from public.effective_events e where e.object_id in (select id from obj)),
      'slots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.activity_slots s where s.active and s.object_id in (select id from obj)),
      'changes', (select coalesce(jsonb_agg(to_jsonb(c) - 'changed_by' - 'changed_at'), '[]') from public.activity_changes c
                   join public.activity_slots s on s.id = c.slot_id
                  where s.object_id in (select id from obj) and c.on_date >= current_date - 8)
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.push_subscriptions, public.notification_log, public.calendar_links from anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text, text), public.calendar_link_reset(),
  public.calendar_data(text), app.can_see_as(uuid, public.member_role, uuid, public.visibility, boolean) from public, anon;
grant select, delete on public.push_subscriptions to authenticated;
grant select on public.calendar_links to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text), public.calendar_link_reset() to authenticated;
grant execute on function app.can_see_as(uuid, public.member_role, uuid, public.visibility, boolean) to authenticated;
-- The calendar route has no signed-in user: the link's token is the key.
grant execute on function public.calendar_data(text) to anon, authenticated;
