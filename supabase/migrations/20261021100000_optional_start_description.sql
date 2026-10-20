-- Activities: the start time is optional (an all-day thing, or a time nobody knows yet);
-- an end time still needs a start.
alter table public.activity_slots alter column starts_at drop not null;
alter table public.activity_slots add constraint slot_end_needs_start check (ends_at is null or starts_at is not null);

-- Activities: "Contact" becomes a free "Description"; a contact already entered is kept in it.
-- The detail is renamed first so the items' values check against the new name.
update public.field_defs f set key = 'description', label = 'Description'
  from public.object_types t
 where t.id = f.object_type_id and t.name = 'Activity or work' and f.key = 'contact';
update public.objects o
   set field_values = (o.field_values - 'contact')
       || case when o.field_values -> 'contact' <> 'null'::jsonb
               then jsonb_build_object('description', 'Contact: ' || (o.field_values ->> 'contact'))
               else '{}'::jsonb end
  from public.object_types t
 where t.id = o.object_type_id and t.name = 'Activity or work' and o.field_values ? 'contact';
