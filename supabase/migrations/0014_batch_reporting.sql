-- Soporte de reportes por lote y por mes (auditoría interna de utilidades).
--
-- expenses.batch_id: gasto manual/sueldo-base se liga al lote activo (el más
-- viejo con stock, entre variantes) en el momento en que se registra — snapshot,
-- no se recalcula después. Nullable: gastos históricos quedan sin lote (se ven
-- igual en el reporte mensual, no en el reporte por lote).
--
-- sale_batch_consumptions.consumes_stock: distingue consumo real de stock
-- (default true, comportamiento existente sin cambios) de una atribución de
-- costo "sólo para reporte" que NO debe afectar el cálculo de unidades
-- restantes por lote. Caso de uso: el cobro de faltantes en una recogida de
-- consignación (`consumeStock=false` en `createConsignmentSale`) ya sabe de
-- qué lotes salieron esas unidades (vía `extractCostFromOutstanding`), pero el
-- stock físico ya se descontó en la entrega original — insertar esas filas
-- con consumes_stock=false permite atribuir esa venta a un lote en los
-- reportes sin restar unidades dos veces.

alter table public.expenses
  add column if not exists batch_id uuid references public.production_batches (id) on delete set null;

create index if not exists expenses_batch_id_idx on public.expenses (batch_id);

alter table public.sale_batch_consumptions
  add column if not exists consumes_stock boolean not null default true;
