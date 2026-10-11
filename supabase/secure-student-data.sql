-- Repair / harden Scholar News student-data isolation.
-- Run this in the Supabase SQL Editor for the exact project URL configured in premium/config.js.
begin;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.drafts enable row level security;
alter table public.cv_files enable row level security;

-- Remove any older or overly broad policies from these application-owned tables.
do $$
declare p record;
begin
 for p in
  select schemaname, tablename, policyname
  from pg_policies
  where schemaname='public'
    and tablename in ('profiles','applications','drafts','cv_files')
 loop
  execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;

revoke all on table public.profiles, public.applications, public.drafts, public.cv_files from anon;
grant select, insert, update, delete on table public.profiles, public.applications, public.drafts, public.cv_files to authenticated;

create policy "Scholar News users access their own profile" on public.profiles
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

create policy "Scholar News users access their own applications" on public.applications
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

create policy "Scholar News users access their own drafts" on public.drafts
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

create policy "Scholar News users access their own CV metadata" on public.cv_files
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
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
on conflict(id) do update
 set public=false,
     file_size_limit=excluded.file_size_limit,
     allowed_mime_types=excluded.allowed_mime_types;

-- Remove older policies that were written specifically for this bucket, then recreate its folder-owner rules.
do $$
declare p record;
begin
 for p in
  select schemaname, tablename, policyname
  from pg_policies
  where schemaname='storage'
    and tablename='objects'
    and (
      coalesce(qual,'') ilike '%student-cvs%'
      or coalesce(with_check,'') ilike '%student-cvs%'
      or lower(policyname) like '%student%cv%'
    )
 loop
  execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;

create policy "Scholar News students read own CV files" on storage.objects
 for select to authenticated
 using (
  bucket_id='student-cvs'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
 );

create policy "Scholar News students upload own CV files" on storage.objects
 for insert to authenticated
 with check (
  bucket_id='student-cvs'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
 );

create policy "Scholar News students update own CV files" on storage.objects
 for update to authenticated
 using (
  bucket_id='student-cvs'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
 )
 with check (
  bucket_id='student-cvs'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
 );

create policy "Scholar News students delete own CV files" on storage.objects
 for delete to authenticated
 using (
  bucket_id='student-cvs'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
 );

notify pgrst, 'reload schema';
commit;
