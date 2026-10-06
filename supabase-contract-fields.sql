-- Execute após os SQLs anteriores.
alter table public.vehicle_private add column fabrication_year integer check (fabrication_year between 1900 and 2100);
alter table public.vehicle_private add column engine_number text not null default '';
alter table public.vehicle_private add column registration_category text not null default '';
alter table public.vehicle_private add column power_displacement text not null default '';
-- Estas colunas continuam protegidas pelas políticas de vehicle_private.
