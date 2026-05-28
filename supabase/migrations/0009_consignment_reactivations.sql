-- Reactivations log — cada vez que un cliente cerrado vuelve a abrirse genera
-- un evento auditable que respalda la factura RA-XXXX.

create table if not exists public.consignment_reactivations (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  created_by               uuid not null references auth.users(id),
  client_id                uuid not null references public.consignment_clients(id) on delete cascade,
  units_with_alcohol       integer not null default 0 check (units_with_alcohol >= 0),
  units_without_alcohol    integer not null default 0 check (units_without_alcohol >= 0),
  unit_price_with_alcohol  numeric(12, 2) not null,
  unit_price_without_alcohol numeric(12, 2) not null,
  sale_id_with_alcohol     uuid references public.sales(id) on delete set null,
  sale_id_without_alcohol  uuid references public.sales(id) on delete set null,
  notes                    text
);

create index if not exists consignment_reactivations_client_id_idx
  on public.consignment_reactivations (client_id);
create index if not exists consignment_reactivations_created_at_idx
  on public.consignment_reactivations (created_at desc);

alter table public.consignment_reactivations enable row level security;

drop policy if exists "consignment_reactivations_all_admin" on public.consignment_reactivations;
create policy "consignment_reactivations_all_admin"
on public.consignment_reactivations for all
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
