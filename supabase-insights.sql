-- Execute depois dos quatro scripts iniciais.
-- Métricas anônimas e agregadas: não armazena IP, user-agent ou dados pessoais.

alter table public.vehicles
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists published_at timestamptz;

create or replace function public.set_vehicle_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at = coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_vehicle_timestamps on public.vehicles;
create trigger set_vehicle_timestamps
before insert or update on public.vehicles
for each row execute function public.set_vehicle_timestamps();

update public.vehicles
set published_at = coalesce(published_at, created_at)
where status = 'published' and published_at is null;

create table if not exists public.vehicle_events (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'contact')),
  session_id uuid not null,
  event_day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (vehicle_id, event_type, session_id, event_day)
);

create index if not exists vehicle_events_vehicle_created_idx
on public.vehicle_events (vehicle_id, created_at desc);

alter table public.vehicle_events enable row level security;
revoke all on public.vehicle_events from anon, authenticated;

create or replace function public.track_vehicle_event(
  p_vehicle_id uuid,
  p_event_type text,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in ('view', 'contact') or p_session_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and status = 'published'
  ) then
    return;
  end if;

  insert into public.vehicle_events (vehicle_id, event_type, session_id)
  values (p_vehicle_id, p_event_type, p_session_id)
  on conflict (vehicle_id, event_type, session_id, event_day) do nothing;
end;
$$;

revoke all on function public.track_vehicle_event(uuid, text, uuid) from public;
grant execute on function public.track_vehicle_event(uuid, text, uuid) to anon, authenticated;

create or replace function public.get_vehicle_insights()
returns table (
  vehicle_id uuid,
  views_total bigint,
  views_7d bigint,
  views_30d bigint,
  contacts_total bigint,
  contacts_7d bigint,
  contacts_30d bigint,
  last_view timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_ccar_admin() then
    raise exception 'Acesso não autorizado';
  end if;

  return query
  select
    e.vehicle_id,
    count(*) filter (where e.event_type = 'view'),
    count(*) filter (where e.event_type = 'view' and e.created_at >= now() - interval '7 days'),
    count(*) filter (where e.event_type = 'view' and e.created_at >= now() - interval '30 days'),
    count(*) filter (where e.event_type = 'contact'),
    count(*) filter (where e.event_type = 'contact' and e.created_at >= now() - interval '7 days'),
    count(*) filter (where e.event_type = 'contact' and e.created_at >= now() - interval '30 days'),
    max(e.created_at) filter (where e.event_type = 'view')
  from public.vehicle_events e
  group by e.vehicle_id;
end;
$$;

revoke all on function public.get_vehicle_insights() from public;
grant execute on function public.get_vehicle_insights() to authenticated;

-- Série diária para o gráfico do painel. Dias sem eventos também são retornados.
create or replace function public.get_dashboard_timeseries(p_days integer default 30)
returns table (
  event_day date,
  views bigint,
  contacts bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
begin
  if not public.is_ccar_admin() then
    raise exception 'Acesso não autorizado';
  end if;

  return query
  select
    days.day::date,
    count(e.id) filter (where e.event_type = 'view'),
    count(e.id) filter (where e.event_type = 'contact')
  from generate_series(
    current_date - (safe_days - 1),
    current_date,
    interval '1 day'
  ) as days(day)
  left join public.vehicle_events e on e.event_day = days.day::date
  group by days.day
  order by days.day;
end;
$$;

revoke all on function public.get_dashboard_timeseries(integer) from public;
grant execute on function public.get_dashboard_timeseries(integer) to authenticated;

-- Ranking por veículo no período selecionado no painel.
create or replace function public.get_dashboard_vehicle_insights(p_days integer default 30)
returns table (
  vehicle_id uuid,
  views bigint,
  contacts bigint,
  last_view timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
begin
  if not public.is_ccar_admin() then
    raise exception 'Acesso não autorizado';
  end if;

  return query
  select
    e.vehicle_id,
    count(*) filter (where e.event_type = 'view'),
    count(*) filter (where e.event_type = 'contact'),
    max(e.created_at) filter (where e.event_type = 'view')
  from public.vehicle_events e
  where e.created_at >= now() - make_interval(days => safe_days)
  group by e.vehicle_id;
end;
$$;

revoke all on function public.get_dashboard_vehicle_insights(integer) from public;
grant execute on function public.get_dashboard_vehicle_insights(integer) to authenticated;
