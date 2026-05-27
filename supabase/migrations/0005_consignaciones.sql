-- Consignaciones: establecimientos y reposiciones
-- Table: consignment_clients
create table if not exists public.consignment_clients (
  id                              uuid primary key default gen_random_uuid(),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid not null references auth.users(id),
  name                            text not null,
  address                         text not null,
  lat                             numeric(10, 7),
  lng                             numeric(10, 7),
  contact_name                    text,
  phone                           text,
  notes                           text,
  is_active                       boolean not null default true,
  base_quantity_with_alcohol      integer not null default 0 check (base_quantity_with_alcohol >= 0),
  base_quantity_without_alcohol   integer not null default 0 check (base_quantity_without_alcohol >= 0),
  price_with_alcohol              numeric(12, 2),
  price_without_alcohol           numeric(12, 2),
  replenishment_day_of_month      integer not null default 1 check (replenishment_day_of_month between 1 and 31),
  next_replenishment_date         date not null
);

-- Trigger: auto-update updated_at
drop trigger if exists consignment_clients_set_updated_at on public.consignment_clients;
create trigger consignment_clients_set_updated_at
before update on public.consignment_clients
for each row execute function public.set_updated_at();

-- Table: consignment_replenishments
create table if not exists public.consignment_replenishments (
  id                              uuid primary key default gen_random_uuid(),
  created_at                      timestamptz not null default now(),
  created_by                      uuid not null references auth.users(id),
  client_id                       uuid not null references public.consignment_clients(id) on delete cascade,
  units_delivered_with_alcohol    integer not null default 0 check (units_delivered_with_alcohol >= 0),
  units_delivered_without_alcohol integer not null default 0 check (units_delivered_without_alcohol >= 0),
  unit_price_with_alcohol         numeric(12, 2) not null,
  unit_price_without_alcohol      numeric(12, 2) not null,
  amount_charged                  numeric(12, 2) not null check (amount_charged >= 0),
  new_base_with_alcohol           integer not null check (new_base_with_alcohol >= 0),
  new_base_without_alcohol        integer not null check (new_base_without_alcohol >= 0),
  triggered_early                 boolean not null default false,
  notes                           text
);

-- Indexes
create index if not exists consignment_replenishments_client_id_idx
  on public.consignment_replenishments (client_id);
create index if not exists consignment_replenishments_created_at_idx
  on public.consignment_replenishments (created_at desc);

-- RLS
alter table public.consignment_clients enable row level security;
alter table public.consignment_replenishments enable row level security;

-- Policy: consignment_clients select (admin only)
drop policy if exists "consignment_clients_select_admin" on public.consignment_clients;
create policy "consignment_clients_select_admin"
on public.consignment_clients for select
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

-- Policy: consignment_clients write (admin only)
drop policy if exists "consignment_clients_write_admin" on public.consignment_clients;
create policy "consignment_clients_write_admin"
on public.consignment_clients for all
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
)
with check (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

-- Policy: consignment_replenishments select (admin only)
drop policy if exists "consignment_replenishments_select_admin" on public.consignment_replenishments;
create policy "consignment_replenishments_select_admin"
on public.consignment_replenishments for select
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

-- Policy: consignment_replenishments write (admin only)
drop policy if exists "consignment_replenishments_write_admin" on public.consignment_replenishments;
create policy "consignment_replenishments_write_admin"
on public.consignment_replenishments for all
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
)
with check (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);
