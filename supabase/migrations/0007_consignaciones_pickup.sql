-- Consignaciones v2: pickups, batch traceability, simplified replenishment cycle

-- 1. Drop unused columns
alter table public.consignment_clients
  drop column if exists is_active;

alter table public.consignment_replenishments
  drop column if exists triggered_early,
  drop column if exists units_sold_with_alcohol,
  drop column if exists units_sold_without_alcohol;

-- 2. Link sales to consignment client (traceability)
alter table public.sales
  add column if not exists consignment_client_id uuid references public.consignment_clients(id) on delete set null;

create index if not exists sales_consignment_client_id_idx
  on public.sales (consignment_client_id) where consignment_client_id is not null;

-- 3. Pickups table — cierre del cliente
create table if not exists public.consignment_pickups (
  id                              uuid primary key default gen_random_uuid(),
  created_at                      timestamptz not null default now(),
  created_by                      uuid not null references auth.users(id),
  client_id                       uuid not null references public.consignment_clients(id) on delete cascade,
  units_collected_with_alcohol    integer not null default 0 check (units_collected_with_alcohol >= 0),
  units_collected_without_alcohol integer not null default 0 check (units_collected_without_alcohol >= 0),
  units_charged_with_alcohol      integer not null default 0 check (units_charged_with_alcohol >= 0),
  units_charged_without_alcohol   integer not null default 0 check (units_charged_without_alcohol >= 0),
  unit_price_with_alcohol         numeric(12, 2) not null,
  unit_price_without_alcohol      numeric(12, 2) not null,
  amount_charged                  numeric(12, 2) not null check (amount_charged >= 0),
  sale_id_with_alcohol            uuid references public.sales(id) on delete set null,
  sale_id_without_alcohol         uuid references public.sales(id) on delete set null,
  notes                           text
);

create index if not exists consignment_pickups_client_id_idx on public.consignment_pickups (client_id);
create index if not exists consignment_pickups_created_at_idx on public.consignment_pickups (created_at desc);

-- 4. Inventory returns — granizados retornados al stock (con trazabilidad por lote)
create table if not exists public.inventory_returns (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users(id),
  batch_id         uuid not null references public.production_batches(id) on delete restrict,
  variant          text not null check (variant in ('withAlcohol','withoutAlcohol')),
  units            integer not null check (units > 0),
  source_pickup_id uuid references public.consignment_pickups(id) on delete cascade,
  source_client_id uuid references public.consignment_clients(id) on delete set null,
  notes            text
);

create index if not exists inventory_returns_batch_id_idx on public.inventory_returns (batch_id);
create index if not exists inventory_returns_pickup_id_idx on public.inventory_returns (source_pickup_id);
create index if not exists inventory_returns_client_id_idx on public.inventory_returns (source_client_id);

-- 5. RLS — admin only
alter table public.consignment_pickups enable row level security;
alter table public.inventory_returns enable row level security;

drop policy if exists "consignment_pickups_all_admin" on public.consignment_pickups;
create policy "consignment_pickups_all_admin"
on public.consignment_pickups for all
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

drop policy if exists "inventory_returns_all_admin" on public.inventory_returns;
create policy "inventory_returns_all_admin"
on public.inventory_returns for all
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
