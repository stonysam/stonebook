-- Stonebook: Google-only sign-in, parent confirmation of kids' chores, family celebrations
--
--   * Only a Google sign-in can claim a place on the allow-list.
--   * When the 7- or 14-year-old logs a chore someone else set them, it waits for a parent.
--     It doesn't count (due dates, feed) until a parent approves it.
--   * Completions on items the whole family can see go into a family feed, where anyone
--     can react with one of six emoji. In-app only; no push.

-- ---------------------------------------------------------------------------
-- Google-only sign-in
-- ---------------------------------------------------------------------------
create or replace function app.claim_membership() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  claimed uuid;
  jwt_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or jwt_email is null
     or (auth.jwt() -> 'app_metadata' ->> 'provider') is distinct from 'google' then
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
-- Which item types need a parent's OK when a kid logs them
-- ---------------------------------------------------------------------------
alter table public.object_types add column confirm_kid_logs boolean not null default false;
update public.object_types set confirm_kid_logs = true where name = 'Chore';

-- ---------------------------------------------------------------------------
-- Events: stamped by the database at insert, never trusted from the app
--   needs_confirmation: logged by a junior/child on a confirm-type item they didn't create
--   root_id:            the original entry a chain of corrections goes back to, so
--                       reactions survive a correction
-- ---------------------------------------------------------------------------
alter table public.events add column needs_confirmation boolean not null default false;
alter table public.events add column root_id uuid references public.events(id);

alter table public.events disable trigger events_append_only;
with recursive chain as (
  select id, id as root from public.events where correction_of is null
  union all
  select e.id, c.root from public.events e join chain c on e.correction_of = c.id
)
update public.events e set root_id = chain.root from chain where chain.id = e.id;
alter table public.events enable trigger events_append_only;

alter table public.events alter column root_id set not null;
create index events_root_idx on public.events(root_id);

create or replace function app.stamp_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.root_id := coalesce((select e.root_id from public.events e where e.id = new.correction_of), new.id);
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

create trigger events_stamp
  before insert on public.events
  for each row execute function app.stamp_event();

-- ---------------------------------------------------------------------------
-- Confirmations: one final decision per waiting entry, by either parent
-- ---------------------------------------------------------------------------
create table public.confirmations (
  event_id    uuid primary key references public.events(id),
  approved    boolean not null,
  decided_by  uuid not null references public.members(id),
  decided_at  timestamptz not null default now(),
  note        text
);
alter table public.confirmations enable row level security;

create policy confirmations_read on public.confirmations for select
  using (exists (select 1 from public.events e where e.id = event_id));

create policy confirmations_insert on public.confirmations for insert
  with check (
    app.is_parent()
    and decided_by = app.my_id()
    and exists (select 1 from public.events e where e.id = event_id and e.needs_confirmation)
  );
-- No update/delete: a decision is final. A rejected chore is simply logged again.

-- The events that currently count: originals not replaced, non-void corrections,
-- and nothing still waiting for (or refused by) a parent.
create or replace view public.effective_events with (security_invoker = true) as
  select e.*
    from public.events e
   where not e.voided
     and not exists (select 1 from public.events c where c.correction_of = e.id)
     and (not e.needs_confirmation
          or exists (select 1 from public.confirmations k where k.event_id = e.id and k.approved));

-- Kids' entries waiting for a parent. Parents see the queue; a kid sees their own.
-- assigned_by is the parent the request goes to (either parent may answer).
create view public.awaiting_confirmation with (security_invoker = true) as
  select e.id as event_id, e.object_id, o.name as object_name, e.kind, e.occurred_on, e.note,
         e.created_by, e.created_at, o.created_by as assigned_by
    from public.events e
    join public.objects o on o.id = e.object_id
   where e.needs_confirmation
     and not e.voided
     and not exists (select 1 from public.events c where c.correction_of = e.id)
     and not exists (select 1 from public.confirmations k where k.event_id = e.id);

-- ---------------------------------------------------------------------------
-- Family feed: what got done on items the whole family can see
-- ---------------------------------------------------------------------------
create or replace function app.is_family_wide(o public.objects) returns boolean
language sql immutable as $$
  select o.visibility = 'shared' or (o.visibility = 'personal' and o.share_with_family)
$$;

create table public.reactions (
  event_id    uuid not null references public.events(id),  -- the root entry (events.root_id)
  member_id   uuid not null references public.members(id),
  emoji       text not null check (emoji in ('clap', 'fire', 'heart', 'star', 'muscle', 'wolf')),
  created_at  timestamptz not null default now(),
  primary key (event_id, member_id, emoji)
);
alter table public.reactions enable row level security;

-- Each item appears once, keyed by its root entry. It's announced when it was logged, or
-- when a parent approved it, so a correction doesn't re-announce it.
create view public.family_feed with (security_invoker = true) as
  select e.root_id as id,
         e.id as event_id,
         e.object_id,
         o.name as object_name,
         e.kind,
         e.occurred_on,
         e.note,
         e.created_by,
         coalesce(k.decided_at, r.created_at) as announced_at,
         coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'member_id', x.member_id)
                                    order by x.created_at)
                     from public.reactions x where x.event_id = e.root_id), '[]'::jsonb) as reactions
    from public.effective_events e
    join public.objects o on o.id = e.object_id
    join public.events r on r.id = e.root_id
    left join public.confirmations k on k.event_id = e.id
   where app.is_family_wide(o);

create policy reactions_read on public.reactions for select
  using (exists (select 1 from public.events e where e.id = event_id));

create policy reactions_insert on public.reactions for insert
  with check (
    app.my_role() in ('parent', 'member', 'junior')
    and member_id = app.my_id()
    and exists (select 1 from public.effective_events e
                  join public.objects o on o.id = e.object_id
                 where e.root_id = event_id and app.is_family_wide(o))
  );

create policy reactions_delete on public.reactions for delete
  using (member_id = app.my_id());

-- When each person last opened the feed, for the badge.
create table public.feed_seen (
  member_id  uuid primary key references public.members(id),
  seen_at    timestamptz not null default now()
);
alter table public.feed_seen enable row level security;

create policy feed_seen_own on public.feed_seen for all
  using (member_id = app.my_id())
  with check (member_id = app.my_id());

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants new tables and views to the API roles by default)
-- ---------------------------------------------------------------------------
revoke all on public.confirmations, public.reactions, public.feed_seen,
              public.awaiting_confirmation, public.family_feed from anon, authenticated;
revoke all on function app.stamp_event(), app.is_family_wide(public.objects) from public, anon;
grant execute on function app.is_family_wide(public.objects) to authenticated;

grant select, insert on public.confirmations to authenticated;
grant select, insert, delete on public.reactions to authenticated;
grant select, insert, update on public.feed_seen to authenticated;
grant select on public.awaiting_confirmation, public.family_feed to authenticated;
