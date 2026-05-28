-- Company info — datos legales/operativos que aparecen en las facturas PDF.
-- Singleton: solo existe un registro con id = 'singleton'.

create table if not exists public.company_info (
  id                 text primary key default 'singleton' check (id = 'singleton'),
  legal_name         text not null,
  nit                text not null,
  address            text not null,
  phone              text not null,
  tax_status         text not null,
  sanitary_registry  text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

drop trigger if exists company_info_set_updated_at on public.company_info;
create trigger company_info_set_updated_at
before update on public.company_info
for each row
execute function public.set_updated_at();

-- Seed inicial con los datos de la factura modelo de Trabix.
insert into public.company_info (id, legal_name, nit, address, phone, tax_status, sanitary_registry)
values (
  'singleton',
  'TRABIX GRANIZADOS S.A.S.',
  '109,245,650-1',
  'Armenia, Quindío - Colombia',
  '+57 304 353 5455',
  'No responsable de IVA',
  'RSA-0028762-2023'
)
on conflict (id) do nothing;

alter table public.company_info enable row level security;

-- Cualquier usuario autenticado puede leer (embajadores también podrían ver
-- facturas eventualmente). Solo admin puede modificar.
drop policy if exists "company_info_select_auth" on public.company_info;
create policy "company_info_select_auth"
on public.company_info for select
using (auth.uid() is not null);

drop policy if exists "company_info_update_admin" on public.company_info;
create policy "company_info_update_admin"
on public.company_info for update
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
