-- Índices de rendimiento para las rutas calientes del dashboard admin y del panel
-- del embajador (auditoría técnica #4). Todos son no destructivos e idempotentes.
--
-- Justificación por índice:
--  - sales (ambassador_profile_id, sale_type): la liquidación
--    (`/api/embajadores/liquidar`) y el panel del embajador filtran por
--    `ambassador_profile_id` + `sale_type = 'wholesale'`. El compuesto también
--    sirve las consultas que sólo filtran por `ambassador_profile_id`.
--  - sales (created_at desc): el admin ordena todas las ventas por fecha.
--  - expenses (ambassador_profile_id): agregados de comisión/sueldo por embajador.
--  - sale_batch_consumptions (sale_id): la trazabilidad de consignación hace
--    `.in('sale_id', ...)`; los FK no crean índice automáticamente en Postgres.
--  - inventory_returns (source_client_id, variant): el cálculo de stock en
--    consignación filtra por cliente + variante.

create index if not exists sales_ambassador_profile_id_sale_type_idx
  on public.sales (ambassador_profile_id, sale_type);

create index if not exists sales_created_at_idx
  on public.sales (created_at desc);

create index if not exists expenses_ambassador_profile_id_idx
  on public.expenses (ambassador_profile_id);

create index if not exists sale_batch_consumptions_sale_id_idx
  on public.sale_batch_consumptions (sale_id);

create index if not exists inventory_returns_client_variant_idx
  on public.inventory_returns (source_client_id, variant);
