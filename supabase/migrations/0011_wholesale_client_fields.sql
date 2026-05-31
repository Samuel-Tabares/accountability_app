-- Agrega campos de cliente y domicilio a ventas al por mayor.
-- Todos opcionales: client_name/address/phone quedan NULL si la venta no tiene destinatario.
-- delivery_fee es 0 por defecto (sin domicilio); la factura PDF lo muestra solo si > 0.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_name    text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS client_phone   text,
  ADD COLUMN IF NOT EXISTS delivery_fee   numeric(12,2) NOT NULL DEFAULT 0;
