-- Seed de lotes inicial para Trabix.
-- Borra ventas, consignaciones y lotes existentes (mantiene gastos manuales)
-- e inserta 4 lotes nuevos: 2 con licor a $1,000/u, 2 sin licor a $2,000/u, 100 uds c/u.
--
-- Cómo correrlo:
--   1. Abre Supabase → SQL editor.
--   2. Pega TODO este archivo y ejecuta.
--   3. Si no hay un admin activo en `profiles`, falla con un mensaje claro.
--
-- ⚠ Destructivo. No hay forma de revertirlo sin un backup.

begin;

-- 1. Borrar operacional (hijos → padres respetando FKs).
delete from public.sale_batch_consumptions;
delete from public.inventory_returns;
delete from public.consignment_reactivations;
delete from public.consignment_pickups;
delete from public.consignment_replenishments;
delete from public.consignment_clients;
-- Solo gastos auto-generados por ventas (comisiones/descuentos).
-- Los gastos manuales (categoría sin source_sale_id) se conservan.
delete from public.expenses where source_sale_id is not null;
delete from public.sales;
delete from public.production_batch_items;
delete from public.production_batches;

-- 2. Insertar 4 lotes nuevos atribuidos al primer admin activo.
do $$
declare
  admin_id uuid;
begin
  select id into admin_id
  from public.profiles
  where role = 'admin' and is_active = true
  order by created_at
  limit 1;

  if admin_id is null then
    raise exception 'No hay admin activo en profiles. Crea uno antes de correr el seed.';
  end if;

  insert into public.production_batches (created_by, label, variant, units_produced, total_cost, notes)
  values
    (admin_id, 'Lote A1 — Con licor',   'withAlcohol',    100, 100000, 'Seed inicial · $1,000/u'),
    (admin_id, 'Lote A2 — Con licor',   'withAlcohol',    100, 100000, 'Seed inicial · $1,000/u'),
    (admin_id, 'Lote SA1 — Sin licor',  'withoutAlcohol', 100, 200000, 'Seed inicial · $2,000/u'),
    (admin_id, 'Lote SA2 — Sin licor',  'withoutAlcohol', 100, 200000, 'Seed inicial · $2,000/u');
end $$;

commit;

-- Verificación rápida (opcional, corre por separado):
-- select label, variant, units_produced, total_cost, (total_cost / units_produced) as unit_cost
-- from public.production_batches
-- order by created_at;
