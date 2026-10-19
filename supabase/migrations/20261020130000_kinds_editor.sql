-- Parents edit the kinds of things and their details in the app (object_types and field_defs
-- are already parents-only for writes). These helpers answer "how many things would this
-- affect?" across everyone's items, private ones included, without showing the items.

alter table public.object_types add column hidden boolean not null default false;
comment on column public.object_types.hidden is 'Left out of the Add list; its things stay as they are.';

create or replace function public.kind_usage(p_type uuid) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_parent() then raise exception 'Only Mum or Dad can change kinds of things'; end if;
  return (select count(*) from public.objects where object_type_id = p_type);
end $$;

-- Things with a value for a detail, or (with p_option) with that answer picked.
create or replace function public.field_usage(p_field uuid, p_option text default null) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  d public.field_defs;
begin
  if not app.is_parent() then raise exception 'Only Mum or Dad can change kinds of things'; end if;
  select * into d from public.field_defs where id = p_field;
  if not found then return 0; end if;
  return (select count(*) from public.objects o
           where o.object_type_id = d.object_type_id
             and o.field_values ? d.key
             and o.field_values -> d.key <> 'null'::jsonb
             and (p_option is null
                  or o.field_values -> d.key = to_jsonb(p_option)
                  or (jsonb_typeof(o.field_values -> d.key) = 'array' and o.field_values -> d.key ? p_option)));
end $$;

-- Removes a detail and its values from every thing of that kind. Returns how many things changed.
create or replace function public.remove_field(p_field uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  d public.field_defs;
  n int;
begin
  if not app.is_parent() then raise exception 'Only Mum or Dad can change kinds of things'; end if;
  select * into d from public.field_defs where id = p_field;
  if not found then return 0; end if;
  if d.key in ('picture', 'photo', 'birth_year', 'head_count') and exists (
       select 1 from public.object_types t where t.id = d.object_type_id
          and t.name in ('Chore or task', 'Animal or flock')) then
    raise exception 'The app relies on this detail';
  end if;
  update public.objects set field_values = field_values - d.key
   where object_type_id = d.object_type_id and field_values ? d.key;
  get diagnostics n = row_count;
  delete from public.field_defs where id = p_field;
  return n;
end $$;

revoke execute on function public.kind_usage(uuid), public.field_usage(uuid, text), public.remove_field(uuid) from public, anon;
grant execute on function public.kind_usage(uuid), public.field_usage(uuid, text), public.remove_field(uuid) to authenticated;
