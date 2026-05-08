alter table public.profiles
  add column if not exists boost_active boolean not null default false,
  add column if not exists boost_expires_at timestamptz;

alter table public.sales
  add column if not exists net_profit numeric(12, 2);

alter table public.expenses
  add column if not exists source_sale_id uuid references public.sales (id) on delete cascade;

create index if not exists expenses_source_sale_id_idx
on public.expenses (source_sale_id);
