-- Guardar la base ANTERIOR (al momento de la reposición) por variante.
-- Necesario para reconstruir en la factura la diferenciación entre
-- "reposición de base" (cobrada) y "ampliación de base" (sin cobro).
--
-- Nullable: registros previos a esta migración no tienen el dato y se
-- mostrarán en la factura como una sola línea agregada sin diferenciación.

alter table public.consignment_replenishments
  add column if not exists previous_base_with_alcohol    integer,
  add column if not exists previous_base_without_alcohol integer;
