-- live-only: Supabase Storage.
-- Photos (animals for now). Private bucket; each file sits under its item's id, and only
-- people who can see the item can see the photo. Uploads go through the app, which shrinks
-- them first, so the 2 MB cap is generous. Free tier: 1 GB of storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos'
         and exists (select 1 from public.objects o where o.id::text = (storage.foldername(name))[1]));

create policy photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
              and exists (select 1 from public.objects o where o.id::text = (storage.foldername(name))[1]
                            and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));

create policy photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'photos'
         and exists (select 1 from public.objects o where o.id::text = (storage.foldername(name))[1]
                       and app.manages_object(o.owner_id, o.created_by, o.object_type_id)));
