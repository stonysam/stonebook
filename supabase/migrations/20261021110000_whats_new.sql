-- "What's new" notes: the notes themselves live in the app's code (lib/whats-new.ts);
-- this remembers who has seen which, so a note shows once on any of their devices.
create table public.whats_new_seen (
  member_id  uuid not null references public.members(id) on delete cascade,
  note_id    text not null check (note_id ~ '^[a-z0-9-]{3,60}$'),
  seen_at    timestamptz not null default now(),
  primary key (member_id, note_id)
);
alter table public.whats_new_seen enable row level security;

create policy whats_new_own_read on public.whats_new_seen for select using (member_id = app.my_id());
create policy whats_new_own_add on public.whats_new_seen for insert with check (member_id = app.my_id());
