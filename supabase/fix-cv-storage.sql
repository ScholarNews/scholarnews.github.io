-- Repair Scholar News private CV file storage.
-- Run this in the SQL Editor of the SAME Supabase project configured in premium/config.js.
-- The bucket stays private; user folder policies only allow each signed-in user their own files.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-cvs',
  'student-cvs',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students read their own CV files" on storage.objects;
create policy "Students read their own CV files"
on storage.objects for select to authenticated
using (
  bucket_id = 'student-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Students upload their own CV files" on storage.objects;
create policy "Students upload their own CV files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Students update their own CV files" on storage.objects;
create policy "Students update their own CV files"
on storage.objects for update to authenticated
using (
  bucket_id = 'student-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'student-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Students delete their own CV files" on storage.objects;
create policy "Students delete their own CV files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-cvs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
