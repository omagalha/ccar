-- Execute uma vez no SQL Editor de um projeto Supabase novo.
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
create policy "Read own admin membership" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
create function public.is_ccar_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.admin_users where user_id = (select auth.uid())); $$;
revoke all on function public.is_ccar_admin() from public;
grant execute on function public.is_ccar_admin() to authenticated;
create table public.vehicles (
 id uuid primary key default gen_random_uuid(), make text not null check (length(make) between 1 and 60), model text not null check (length(model) between 1 and 80), version text not null default '',
 year integer not null check (year between 1900 and 2100), price numeric(12,2) not null check (price >= 0), km integer not null check (km >= 0),
 transmission text not null, category text not null, fuel text not null, description text not null default '',
 status text not null default 'draft' check (status in ('draft','published','sold')), featured boolean not null default false,
 photos text[] not null default '{}' check (cardinality(photos) <= 30), created_at timestamptz not null default now()
);
alter table public.vehicles enable row level security;
grant select on public.vehicles to anon, authenticated;
grant insert, update, delete on public.vehicles to authenticated;
create policy "Public published inventory" on public.vehicles for select to anon, authenticated using (status = 'published');
create policy "Authorized team manages inventory" on public.vehicles for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('vehicle-photos','vehicle-photos',true,15728640,array['image/jpeg','image/png','image/webp']);
create policy "Team reads photos" on storage.objects for select to authenticated using (bucket_id = 'vehicle-photos' and public.is_ccar_admin());
create policy "Team uploads photos" on storage.objects for insert to authenticated with check (bucket_id = 'vehicle-photos' and public.is_ccar_admin());
create policy "Team updates photos" on storage.objects for update to authenticated using (bucket_id = 'vehicle-photos' and public.is_ccar_admin()) with check (bucket_id = 'vehicle-photos' and public.is_ccar_admin());
create policy "Team deletes photos" on storage.objects for delete to authenticated using (bucket_id = 'vehicle-photos' and public.is_ccar_admin());
-- Crie/convide cada usuário em Authentication > Users e copie o UUID.
-- Autorize individualmente, substituindo o UUID abaixo:
-- insert into public.admin_users (user_id) values ('UUID-DO-USUARIO');
