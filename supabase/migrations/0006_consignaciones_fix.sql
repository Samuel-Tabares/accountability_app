-- Consignaciones fix: FIFO integration, sales linkage, simpler cycle
-- 1a. Drop unused columns from consignment_clients
alter table public.consignment_clients
  drop column if exists lat,
  drop column if exists lng,
  drop column if exists replenishment_day_of_month;

-- 1b. Add FKs to initial sales (one per variant) on consignment_clients
alter table public.consignment_clients
  add column if not exists initial_sale_id_with_alcohol uuid references public.sales(id) on delete set null,
  add column if not exists initial_sale_id_without_alcohol uuid references public.sales(id) on delete set null;

-- 1c. Add sold/sale fields to consignment_replenishments
alter table public.consignment_replenishments
  add column if not exists units_sold_with_alcohol integer not null default 0 check (units_sold_with_alcohol >= 0),
  add column if not exists units_sold_without_alcohol integer not null default 0 check (units_sold_without_alcohol >= 0),
  add column if not exists sale_id_with_alcohol uuid references public.sales(id) on delete set null,
  add column if not exists sale_id_without_alcohol uuid references public.sales(id) on delete set null;

-- 1d. Update sales.sale_type CHECK constraint to include 'consignment'
alter table public.sales drop constraint if exists sales_sale_type_check;
alter table public.sales add constraint sales_sale_type_check
  check (sale_type in ('unit', 'promo', 'gift', 'singleNoAlcohol', 'giftNoAlcohol', 'wholesale', 'consignment'));
