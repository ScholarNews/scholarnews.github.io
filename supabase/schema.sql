-- Scholar News private student account schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text, full_name text not null default '', country text not null default '',
 institution text not null default '', education_level text not null default '',
 discipline text not null default '', cv_text text not null default '',
 updated_at timestamptz not null default now()
);
create table if not exists public.applications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 opportunity_key text not null, title text not null, institution text, deadline date,
 official_url text,
 status text not null default 'interested' check(status in ('interested','preparing','ready','submitted','interview','offer','rejected','withdrawn')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,opportunity_key)
);
create index if not exists applications_user_deadline_idx on public.applications(user_id,deadline);
create table if not exists public.drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 opportunity_key text not null, tool text not null check(tool in ('eligibility','cover','cv','email','statement')),
 title text not null default '', content text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,tool,opportunity_key)
);
create table if not exists public.cv_files (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique, original_filename text not null,
 content_type text not null default 'application/octet-stream',
 size_bytes bigint not null default 0 check(size_bytes>=0 and size_bytes<=10485760),
 uploaded_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.drafts enable row level security;
alter table public.cv_files enable row level security;

drop policy if exists "Users manage own Scholar News profile" on public.profiles;
create policy "Users manage own Scholar News profile" on public.profiles for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "Users manage own Scholar News applications" on public.applications;
create policy "Users manage own Scholar News applications" on public.applications for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "Users manage own Scholar News drafts" on public.drafts;
create policy "Users manage own Scholar News drafts" on public.drafts for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "Users manage own Scholar News CV metadata" on public.cv_files;
create policy "Users manage own Scholar News CV metadata" on public.cv_files for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-cvs','student-cvs',false,10485760,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Students read their own CV files" on storage.objects;
create policy "Students read their own CV files" on storage.objects for select to authenticated using(bucket_id='student-cvs' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "Students upload their own CV files" on storage.objects;
create policy "Students upload their own CV files" on storage.objects for insert to authenticated with check(bucket_id='student-cvs' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "Students update their own CV files" on storage.objects;
create policy "Students update their own CV files" on storage.objects for update to authenticated using(bucket_id='student-cvs' and (storage.foldername(name))[1]=(select auth.uid()::text)) with check(bucket_id='student-cvs' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "Students delete their own CV files" on storage.objects;
create policy "Students delete their own CV files" on storage.objects for delete to authenticated using(bucket_id='student-cvs' and (storage.foldername(name))[1]=(select auth.uid()::text));
