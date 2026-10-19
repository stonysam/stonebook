-- Animals one by one, in groups: Clyde the donkey has his own vet history and is part of
-- "Horses and Clyde", where the feeding happens. An item is in one group at most, and a
-- group can't be inside another group.
alter table public.objects add column is_group boolean not null default false;
alter table public.objects add column parent_id uuid references public.objects(id);
create index objects_parent_idx on public.objects(parent_id);

-- Security definer so the check sees the group even where the person can't (they still
-- can't see or change it); it only answers whether the link is allowed.
create or replace function app.check_group() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g public.objects;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'Something can''t be part of itself'; end if;
    if new.is_group then raise exception 'A group can''t be part of another group'; end if;
    select * into g from public.objects where id = new.parent_id;
    if not found or not g.is_group or g.object_type_id <> new.object_type_id then
      raise exception 'Pick a group of the same kind';
    end if;
  end if;
  if not new.is_group and exists (select 1 from public.objects c where c.parent_id = new.id and c.archived_at is null) then
    raise exception 'It still has members; move them to another group first';
  end if;
  return new;
end $$;

create trigger objects_check_group
  before insert or update of parent_id, is_group on public.objects
  for each row execute function app.check_group();

-- Animals: a birth year and a photo (the photo's place in storage, under the item's id).
insert into public.field_defs (object_type_id, key, label, kind, required, sort_order)
select t.id, f.key, f.label, f.kind::public.field_kind, false, f.sort_order
  from public.object_types t
  cross join (values ('photo', 'Photo', 'text', 5), ('birth_year', 'Year born', 'number', 15)) f(key, label, kind, sort_order)
 where t.name = 'Animal or flock'
on conflict (object_type_id, key) do nothing;

-- Animals already added with a head count are groups.
update public.objects o set is_group = true
  from public.object_types t
 where t.id = o.object_type_id and t.name = 'Animal or flock' and o.field_values ? 'head_count';

alter table public.object_types add column groups boolean not null default false;
comment on column public.object_types.groups is 'Items of this type can be single things or groups of them (animals).';
update public.object_types set groups = true where name = 'Animal or flock';
