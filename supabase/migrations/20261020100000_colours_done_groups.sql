-- 19 Oct evening: person colours, Done-or-Log per reminder, group tasks (one reminder per person,
-- each ticks their own part or "aborts the mission"), one-off activities with several people going.

-- Person colours, from a fixed palette that suits the app. Parents choose (members_write is parents only).
alter table public.members add column color text
  check (color is null or color in ('moss', 'sky', 'clay', 'plum', 'hay', 'slate', 'rose', 'teal'));

-- How a reminder is ticked off: 'done' is one tap; 'log' opens the sheet for a note, reading or date.
alter table public.rules add column completion text not null default 'log' check (completion in ('done', 'log'));
update public.rules r set completion = 'done'
  from public.objects o join public.object_types t on t.id = o.object_type_id
 where o.id = r.object_id and t.assignable;

-- Activities: a one-off date (the family dentist visit) and who's going (several people).
-- An empty list means the person it belongs to.
alter table public.activity_slots add column on_date date;
alter table public.activity_slots add column people uuid[] not null default '{}';
alter table public.activity_slots add constraint slot_one_off_day
  check (on_date is null or weekdays = array[extract(isodow from on_date)::smallint]);

create or replace function app.stamp_activity_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.changed_by := coalesce(app.my_id(), new.changed_by);
  new.changed_at := now();
  if not exists (select 1 from public.activity_slots s
                  where s.id = new.slot_id and extract(isodow from new.on_date)::smallint = any(s.weekdays)
                    and (s.on_date is null or s.on_date = new.on_date)) then
    raise exception 'That date isn''t one of its days';
  end if;
  return new;
end $$;

-- "Abort mission": someone on a group task who didn't take part closes their part with an
-- entry marked data.skipped. It counts for the reminder but isn't announced in the feed.
create or replace view public.family_feed with (security_invoker = true) as
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
   where app.is_family_wide(o)
     and coalesce((e.data ->> 'skipped')::boolean, false) = false;
