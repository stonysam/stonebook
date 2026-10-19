-- Choice fields can allow several answers (an animal group: Chicken and Duck; Horse and Donkey).
-- A several-answer value is a JSON array of options; a single string is still accepted.
alter table public.field_defs add column multiple boolean not null default false;

update public.field_defs f set multiple = true,
       options = case when f.options ? 'Donkey' then f.options
                      else (select jsonb_agg(x) from (
                              select x from jsonb_array_elements_text(f.options) x where x <> 'Other'
                              union all select 'Donkey'
                              union all select 'Other') s) end
  from public.object_types t
 where t.id = f.object_type_id and t.name = 'Animal or flock' and f.key = 'species';

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
    elsif d.kind = 'choice' and d.multiple and jsonb_typeof(v) = 'array' then
      if jsonb_array_length(v) = 0
         or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or not (d.options ? (x #>> '{}'))) then
        raise exception '% must be one or more of %', d.label, d.options;
      end if;
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
    if not (new.field_values ? d.key) or new.field_values -> d.key in ('null'::jsonb, '[]'::jsonb) then
      raise exception '% is required', d.label;
    end if;
  end loop;

  return new;
end $$;
