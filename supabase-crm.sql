-- CRM compartilhado da C CAR.
-- Execute uma vez no SQL Editor DEPOIS dos demais scripts do projeto.
-- Todos os usuários presentes em public.admin_users podem consultar e trabalhar os mesmos leads.

create table if not exists public.crm_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 160),
  phone text not null check (length(phone) between 8 and 20),
  email text not null default '',
  birthday date,
  source text not null default 'WhatsApp' check (source in ('Site','WhatsApp','Instagram','Facebook','Indicação','Visita','Outro')),
  stage text not null default 'new' check (stage in ('new','contacted','qualified','visit','proposal','negotiation','won','lost')),
  assigned_user_id uuid references public.crm_team_members(user_id) on delete set null,
  budget numeric(12,2) check (budget is null or budget >= 0),
  has_trade_in boolean not null default false,
  trade_in_details text not null default '',
  next_contact_at timestamptz,
  last_contact_at timestamptz,
  relationship_consent boolean not null default false,
  notes text not null default '',
  lost_reason text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_lead_vehicles (
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  is_primary boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  primary key (lead_id, vehicle_id)
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  activity_type text not null check (activity_type in ('note','call','whatsapp','visit','proposal','stage_change')),
  description text not null check (length(description) between 1 and 4000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_one_primary_vehicle_per_lead
  on public.crm_lead_vehicles (lead_id) where is_primary;
create index if not exists crm_leads_stage_idx on public.crm_leads(stage);
create index if not exists crm_leads_assigned_idx on public.crm_leads(assigned_user_id);
create index if not exists crm_leads_next_contact_idx on public.crm_leads(next_contact_at);
create index if not exists crm_activities_lead_created_idx on public.crm_activities(lead_id, created_at desc);
create index if not exists crm_lead_vehicles_vehicle_idx on public.crm_lead_vehicles(vehicle_id);

create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.crm_protect_lead_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  else
    new.created_by = old.created_by;
  end if;
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.crm_protect_activity_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists crm_team_members_updated_at on public.crm_team_members;
create trigger crm_team_members_updated_at before update on public.crm_team_members
for each row execute function public.crm_set_updated_at();

drop trigger if exists crm_leads_updated_at on public.crm_leads;
create trigger crm_leads_updated_at before update on public.crm_leads
for each row execute function public.crm_set_updated_at();

drop trigger if exists crm_leads_protect_audit on public.crm_leads;
create trigger crm_leads_protect_audit before insert or update on public.crm_leads
for each row execute function public.crm_protect_lead_audit();

drop trigger if exists crm_activities_protect_author on public.crm_activities;
create trigger crm_activities_protect_author before insert or update on public.crm_activities
for each row execute function public.crm_protect_activity_author();

alter table public.crm_team_members enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_lead_vehicles enable row level security;
alter table public.crm_activities enable row level security;

revoke all on public.crm_team_members, public.crm_leads, public.crm_lead_vehicles, public.crm_activities from anon, authenticated;
grant select on public.crm_team_members to authenticated;
grant insert, update on public.crm_team_members to authenticated;
grant select, insert, update, delete on public.crm_leads, public.crm_lead_vehicles to authenticated;
grant select, insert on public.crm_activities to authenticated;

drop policy if exists "Authorized team reads CRM profiles" on public.crm_team_members;
create policy "Authorized team reads CRM profiles" on public.crm_team_members
for select to authenticated using (public.is_ccar_admin());

drop policy if exists "Team member maintains own CRM profile" on public.crm_team_members;
create policy "Team member maintains own CRM profile" on public.crm_team_members
for insert to authenticated with check (public.is_ccar_admin() and user_id = (select auth.uid()));

drop policy if exists "Team member updates own CRM profile" on public.crm_team_members;
create policy "Team member updates own CRM profile" on public.crm_team_members
for update to authenticated using (public.is_ccar_admin() and user_id = (select auth.uid()))
with check (public.is_ccar_admin() and user_id = (select auth.uid()));

drop policy if exists "Authorized team shares CRM leads" on public.crm_leads;
create policy "Authorized team shares CRM leads" on public.crm_leads
for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());

drop policy if exists "Authorized team shares vehicle interests" on public.crm_lead_vehicles;
create policy "Authorized team shares vehicle interests" on public.crm_lead_vehicles
for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());

drop policy if exists "Authorized team shares CRM activities" on public.crm_activities;
create policy "Authorized team shares CRM activities" on public.crm_activities
for all to authenticated using (public.is_ccar_admin()) with check (public.is_ccar_admin());

comment on table public.crm_leads is 'Leads compartilhados pela equipe autorizada da C CAR.';
comment on column public.crm_leads.relationship_consent is 'Confirma que o cliente autorizou contatos de relacionamento.';
comment on table public.crm_lead_vehicles is 'Relação muitos-para-muitos entre clientes e veículos de interesse.';
