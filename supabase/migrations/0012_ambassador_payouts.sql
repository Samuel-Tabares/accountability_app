-- Ambassador payouts — liquidación del sueldo base al cierre de cada ciclo de 30
-- días (anclado a la fecha de ingreso del embajador). Cada fila registra el nivel
-- alcanzado y el sueldo base liquidado para ese ciclo, ligado al gasto `monthly`
-- creado (que baja la utilidad neta). Las comisiones NO van aquí: ya se gastan por
-- venta. Las unidades gratis se registran pero aún no se consumen de inventario.

create table if not exists public.ambassador_payouts (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  created_by             uuid not null references auth.users(id),
  ambassador_profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Índice del ciclo relativo al ingreso (0 = primer ciclo). Informativo.
  cycle_index            integer not null check (cycle_index >= 0),
  -- Clave de idempotencia: instante absoluto de inicio del ciclo. Sobrevive a
  -- cambios del ancla en datos de prueba (a diferencia de cycle_index).
  cycle_start            timestamptz not null,
  cycle_end              timestamptz not null,
  units                  integer not null default 0 check (units >= 0),
  level                  text not null,
  base_salary            numeric(12, 2) not null default 0 check (base_salary >= 0),
  -- Snapshot de comisiones del ciclo (referencia; ya gastadas por venta).
  commissions            numeric(12, 2) not null default 0,
  free_units             integer not null default 0 check (free_units >= 0),
  expense_id             uuid references public.expenses(id) on delete set null,
  unique (ambassador_profile_id, cycle_start)
);

create index if not exists ambassador_payouts_ambassador_idx
  on public.ambassador_payouts (ambassador_profile_id);
create index if not exists ambassador_payouts_cycle_start_idx
  on public.ambassador_payouts (cycle_start desc);

alter table public.ambassador_payouts enable row level security;

drop policy if exists "ambassador_payouts_all_admin" on public.ambassador_payouts;
create policy "ambassador_payouts_all_admin"
on public.ambassador_payouts for all
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

drop policy if exists "ambassador_payouts_select_own" on public.ambassador_payouts;
create policy "ambassador_payouts_select_own"
on public.ambassador_payouts for select
using (ambassador_profile_id = auth.uid());
