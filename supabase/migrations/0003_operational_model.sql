alter table public.profiles
  add column if not exists level text not null default 'nivel0',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_updated_at timestamptz,
  add column if not exists password_reset_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_level_check'
  ) then
    alter table public.profiles add constraint profiles_level_check
      check (level in ('nivel0', 'plata', 'oro', 'diamante'));
  end if;
end $$;

create table if not exists public.pricing_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  is_active boolean not null default false,
  unit_with_alcohol_price numeric(12, 2) not null check (unit_with_alcohol_price >= 0),
  unit_no_alcohol_price numeric(12, 2) not null check (unit_no_alcohol_price >= 0),
  promo_package_price numeric(12, 2) not null check (promo_package_price >= 0),
  gift_with_alcohol_price numeric(12, 2) not null default 0 check (gift_with_alcohol_price >= 0),
  gift_no_alcohol_price numeric(12, 2) not null default 0 check (gift_no_alcohol_price >= 0),
  boost_bonus_pct numeric(6, 4) not null default 0 check (boost_bonus_pct >= 0)
);

create unique index if not exists pricing_versions_one_active
on public.pricing_versions (is_active)
where is_active;

create table if not exists public.pricing_wholesale_tiers (
  id uuid primary key default gen_random_uuid(),
  pricing_version_id uuid not null references public.pricing_versions (id) on delete cascade,
  variant text not null check (variant in ('withAlcohol', 'withoutAlcohol')),
  min_quantity integer not null check (min_quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  commission_pct numeric(6, 4) not null default 0 check (commission_pct >= 0),
  client_discount_pct numeric(6, 4) not null default 0 check (client_discount_pct >= 0)
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  label text not null,
  variant text not null check (variant in ('withAlcohol', 'withoutAlcohol')),
  units_produced integer not null check (units_produced > 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  notes text
);

create table if not exists public.production_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  kind text not null check (kind in ('granizado', 'other')),
  name text not null,
  quantity integer check (quantity is null or quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0)
);

alter table public.sales
  add column if not exists sale_type text not null default 'unit',
  add column if not exists wholesale_variant text,
  add column if not exists pricing_version_id uuid references public.pricing_versions (id) on delete set null,
  add column if not exists price_total numeric(12, 2),
  add column if not exists wholesale_discount_pct numeric(6, 4) not null default 0,
  add column if not exists wholesale_discount_value numeric(12, 2) not null default 0,
  add column if not exists wholesale_net_total numeric(12, 2),
  add column if not exists wholesale_base_commission_pct numeric(6, 4) not null default 0,
  add column if not exists wholesale_boost_bonus_pct numeric(6, 4) not null default 0,
  add column if not exists commission_rate numeric(6, 4) not null default 0,
  add column if not exists commission_value numeric(12, 2) not null default 0,
  add column if not exists cost_of_goods numeric(12, 2) not null default 0,
  add column if not exists gross_profit numeric(12, 2),
  add column if not exists margin numeric(8, 4) not null default 0;

update public.sales
set price_total = coalesce(price_total, amount),
    wholesale_net_total = coalesce(wholesale_net_total, amount),
    gross_profit = coalesce(gross_profit, amount - cost_of_goods)
where price_total is null
   or wholesale_net_total is null
   or gross_profit is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_sale_type_check'
  ) then
    alter table public.sales add constraint sales_sale_type_check
      check (sale_type in ('unit', 'promo', 'gift', 'singleNoAlcohol', 'giftNoAlcohol', 'wholesale'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sales_wholesale_variant_check'
  ) then
    alter table public.sales add constraint sales_wholesale_variant_check
      check (wholesale_variant is null or wholesale_variant in ('withAlcohol', 'withoutAlcohol'));
  end if;
end $$;

create table if not exists public.sale_batch_consumptions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  batch_id uuid references public.production_batches (id) on delete set null,
  units integer not null check (units > 0),
  cost numeric(12, 2) not null check (cost >= 0)
);

insert into public.pricing_versions (
  is_active,
  unit_with_alcohol_price,
  unit_no_alcohol_price,
  promo_package_price,
  gift_with_alcohol_price,
  gift_no_alcohol_price,
  boost_bonus_pct
)
select true, 8000, 7000, 12000, 0, 0, 0.05
where not exists (select 1 from public.pricing_versions);

insert into public.pricing_wholesale_tiers (
  pricing_version_id,
  variant,
  min_quantity,
  unit_price,
  commission_pct,
  client_discount_pct
)
select pv.id, tier.variant, tier.min_quantity, tier.unit_price, tier.commission_pct, tier.client_discount_pct
from public.pricing_versions pv
cross join (
  values
    ('withAlcohol', 20, 4900, 0.15, 0.10),
    ('withAlcohol', 50, 4700, 0.18, 0.12),
    ('withAlcohol', 100, 4500, 0.20, 0.15),
    ('withoutAlcohol', 20, 4800, 0.15, 0.10),
    ('withoutAlcohol', 50, 4500, 0.18, 0.12),
    ('withoutAlcohol', 100, 4200, 0.20, 0.15)
) as tier(variant, min_quantity, unit_price, commission_pct, client_discount_pct)
where pv.is_active
  and not exists (
    select 1
    from public.pricing_wholesale_tiers existing
    where existing.pricing_version_id = pv.id
  );

alter table public.pricing_versions enable row level security;
alter table public.pricing_wholesale_tiers enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_items enable row level security;
alter table public.sale_batch_consumptions enable row level security;

drop policy if exists "pricing_versions_select_active_or_admin" on public.pricing_versions;
create policy "pricing_versions_select_active_or_admin"
on public.pricing_versions
for select
using (
  is_active
  or exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "pricing_versions_write_admin" on public.pricing_versions;
create policy "pricing_versions_write_admin"
on public.pricing_versions
for all
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

drop policy if exists "pricing_wholesale_tiers_select" on public.pricing_wholesale_tiers;
create policy "pricing_wholesale_tiers_select"
on public.pricing_wholesale_tiers
for select
using (
  exists (
    select 1 from public.pricing_versions pv
    where pv.id = pricing_version_id
      and (
        pv.is_active
        or exists (
          select 1 from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.role = 'admin'
            and viewer.is_active
        )
      )
  )
);

drop policy if exists "pricing_wholesale_tiers_write_admin" on public.pricing_wholesale_tiers;
create policy "pricing_wholesale_tiers_write_admin"
on public.pricing_wholesale_tiers
for all
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

drop policy if exists "production_batches_select_admin" on public.production_batches;
create policy "production_batches_select_admin"
on public.production_batches
for select
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "production_batches_write_admin" on public.production_batches;
create policy "production_batches_write_admin"
on public.production_batches
for all
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

drop policy if exists "production_batch_items_select_admin" on public.production_batch_items;
create policy "production_batch_items_select_admin"
on public.production_batch_items
for select
using (
  exists (
    select 1 from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "production_batch_items_write_admin" on public.production_batch_items;
create policy "production_batch_items_write_admin"
on public.production_batch_items
for all
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

drop policy if exists "sale_batch_consumptions_select_owner_or_admin" on public.sale_batch_consumptions;
create policy "sale_batch_consumptions_select_owner_or_admin"
on public.sale_batch_consumptions
for select
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (
        s.ambassador_profile_id = auth.uid()
        or exists (
          select 1 from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.role = 'admin'
            and viewer.is_active
        )
      )
  )
);

drop policy if exists "sale_batch_consumptions_write_admin" on public.sale_batch_consumptions;
create policy "sale_batch_consumptions_write_admin"
on public.sale_batch_consumptions
for all
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
