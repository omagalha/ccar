-- Atualização complementar. Execute DEPOIS de supabase-setup.sql.
-- Dados privados ficam em tabelas separadas do catálogo público.
create table public.vehicle_private (
 vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
 plate text not null default '', chassis text not null default '', renavam text not null default '', color text not null default '',
 owner_name text not null default '', owner_document text not null default '', acquisition_cost numeric(12,2) check (acquisition_cost >= 0), internal_notes text not null default ''
);
create table public.company_settings (
 id integer primary key check (id = 1), legal_name text not null default '', cnpj text not null default '', address text not null default '',
 representative text not null default '', representative_role text not null default ''
);
alter table public.vehicle_private enable row level security;
alter table public.company_settings enable row level security;
revoke all on public.vehicle_private, public.company_settings from anon, authenticated;
grant select, insert, update, delete on public.vehicle_private, public.company_settings to authenticated;
create policy "Only authorized admins access private vehicle data" on public.vehicle_private for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());
create policy "Only authorized admins access company settings" on public.company_settings for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());
