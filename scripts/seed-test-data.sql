-- =====================================================================
-- Seed de prueba TRABIX — datos en volumen para probar listados con scroll
-- =====================================================================
-- Inserta:
--   - 12 lotes de producción (mezcla con/sin licor)
--   - 12 embajadores con auth (password: Trabix123!)
--   - ~60 ventas variadas (unit, promo, gift, wholesale, sin licor)
--   - 15 clientes de consignación con reposiciones
--
-- Cómo correrlo:
--   1. Supabase → SQL editor → pega TODO → ejecuta.
--   2. Requiere un admin activo en `profiles`.
--
-- ⚠ Destructivo: limpia ventas, lotes, consignaciones y embajadores
--   previos (mantiene admin y gastos manuales).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Limpieza (orden: hijos → padres)
-- ---------------------------------------------------------------------
delete from public.sale_batch_consumptions;
delete from public.inventory_returns;
delete from public.consignment_reactivations;
delete from public.consignment_pickups;
delete from public.consignment_replenishments;
delete from public.consignment_clients;
delete from public.expenses where source_sale_id is not null;
delete from public.sales;
delete from public.production_batch_items;
delete from public.production_batches;

-- Embajadores: borrar auth.users de los profiles embajador
-- (el FK on delete cascade limpia los profiles automáticamente)
delete from auth.users
where id in (
  select id from public.profiles where role = 'embajador'
);

-- ---------------------------------------------------------------------
-- 2. Datos en volumen
-- ---------------------------------------------------------------------
do $$
declare
  admin_id   uuid;
  alias_dom  text;
  pv_id      uuid;
  -- arrays para repartir
  batch_with_alc   uuid[];
  batch_no_alc     uuid[];
  emba_ids         uuid[];
  client_ids       uuid[];
  new_user        uuid;
  new_batch       uuid;
  new_sale        uuid;
  new_client      uuid;
  i               int;
  qty             int;
  price_unit      numeric;
  amount          numeric;
  cost_unit       numeric;
  cost_total      numeric;
  amb_id          uuid;
  emba_count      int := 12;
  sale_dt         timestamptz;
begin
  -- admin
  select id into admin_id
  from public.profiles
  where role = 'admin' and is_active = true
  order by created_at
  limit 1;

  if admin_id is null then
    raise exception 'No hay admin activo en profiles. Crea uno primero.';
  end if;

  -- dominio alias (toma el del admin existente)
  select nullif(split_part(email, '@', 2), '')
    into alias_dom
  from public.profiles
  where id = admin_id;
  if alias_dom is null then alias_dom := 'trabix.local'; end if;

  -- pricing version activa
  select id into pv_id
  from public.pricing_versions
  where is_active
  limit 1;

  -- -------------------------------------------------------------------
  -- 2a. LOTES (12 lotes, mezcla con/sin licor, costos variados)
  -- -------------------------------------------------------------------
  with ins as (
    insert into public.production_batches
      (created_by, label, variant, units_produced, total_cost, notes, created_at)
    values
      (admin_id, 'Lote A1 — Con licor',  'withAlcohol',    120, 144000, 'Seed prueba', now() - interval '25 days'),
      (admin_id, 'Lote A2 — Con licor',  'withAlcohol',    150, 165000, 'Seed prueba', now() - interval '22 days'),
      (admin_id, 'Lote A3 — Con licor',  'withAlcohol',    100, 110000, 'Seed prueba', now() - interval '18 days'),
      (admin_id, 'Lote A4 — Con licor',  'withAlcohol',    200, 230000, 'Seed prueba', now() - interval '15 days'),
      (admin_id, 'Lote A5 — Con licor',  'withAlcohol',    180, 198000, 'Seed prueba', now() - interval '10 days'),
      (admin_id, 'Lote A6 — Con licor',  'withAlcohol',    140, 168000, 'Seed prueba', now() - interval '5 days'),
      (admin_id, 'Lote SA1 — Sin licor', 'withoutAlcohol', 100, 200000, 'Seed prueba', now() - interval '24 days'),
      (admin_id, 'Lote SA2 — Sin licor', 'withoutAlcohol', 150, 285000, 'Seed prueba', now() - interval '20 days'),
      (admin_id, 'Lote SA3 — Sin licor', 'withoutAlcohol', 120, 228000, 'Seed prueba', now() - interval '16 days'),
      (admin_id, 'Lote SA4 — Sin licor', 'withoutAlcohol', 180, 342000, 'Seed prueba', now() - interval '12 days'),
      (admin_id, 'Lote SA5 — Sin licor', 'withoutAlcohol', 160, 304000, 'Seed prueba', now() - interval '8 days'),
      (admin_id, 'Lote SA6 — Sin licor', 'withoutAlcohol', 140, 252000, 'Seed prueba', now() - interval '3 days')
    returning id, variant
  )
  select
    array_agg(id) filter (where variant = 'withAlcohol'),
    array_agg(id) filter (where variant = 'withoutAlcohol')
  into batch_with_alc, batch_no_alc
  from ins;

  -- items "granizado" + 1 extra por lote
  insert into public.production_batch_items (batch_id, kind, name, quantity, unit_price)
  select b.id, 'granizado', 'Granizados', b.units_produced, b.total_cost / b.units_produced
  from public.production_batches b;

  insert into public.production_batch_items (batch_id, kind, name, unit_price)
  select b.id, 'other', 'Etiquetas y empaque', 10000
  from public.production_batches b;

  -- -------------------------------------------------------------------
  -- 2b. EMBAJADORES (12 usuarios con auth; password: Trabix123!)
  -- -------------------------------------------------------------------
  emba_ids := array[]::uuid[];

  for i in 1..emba_count loop
    new_user := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      -- GoTrue escanea estos tokens a string no-nullable; si quedan NULL el login falla con 401
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      new_user,
      'authenticated',
      'authenticated',
      'emba' || lpad(i::text, 2, '0') || '@' || alias_dom,
      crypt('Trabix123!', gen_salt('bf')),
      now(),
      now() - (i || ' days')::interval,
      now(),
      '', '', '',
      '', '',
      '', '', '',
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object(
        'username',  'emba' || lpad(i::text, 2, '0'),
        'code',      'emba' || lpad(i::text, 2, '0'),
        'full_name', 'Embajador ' || i,
        'phone',     '+57 300 555 ' || lpad(i::text, 4, '0')
      )
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      new_user,
      jsonb_build_object(
        'sub',   new_user::text,
        'email', 'emba' || lpad(i::text, 2, '0') || '@' || alias_dom
      ),
      'email',
      new_user::text,
      null,
      now(),
      now()
    );

    -- el trigger ya creó el profile; ajustamos extras
    update public.profiles
       set level = case
                     when i <= 3 then 'oro'
                     when i <= 7 then 'plata'
                     else 'nivel0'
                   end,
           boost_active     = (i % 4 = 0),
           boost_expires_at = case when i % 4 = 0
                                   then now() + interval '7 days'
                                   else null end,
           must_change_password = false,
           -- Fecha de ingreso escalonada: el ciclo de 30 días se ancla aquí, así
           -- cada embajador queda en un punto distinto de su ciclo (algunos en
           -- recta final / ventana de recompensas) para probar la gamificación.
           created_at = now() - ((i - 1) * 7 || ' days')::interval
     where id = new_user;

    emba_ids := array_append(emba_ids, new_user);
  end loop;

  -- -------------------------------------------------------------------
  -- 2c. VENTAS variadas (~60 ventas)
  -- -------------------------------------------------------------------

  -- 25 ventas tipo "unit" (con licor)
  for i in 1..25 loop
    qty        := 1 + (i % 5);
    price_unit := 8000;
    amount     := price_unit * qty;
    cost_unit  := 1100;
    cost_total := cost_unit * qty;
    sale_dt    := now() - ((25 - i) || ' hours')::interval;

    insert into public.sales (
      created_by, ambassador_profile_id, amount, quantity, note,
      sale_type, pricing_version_id, price_total,
      commission_rate, commission_value,
      cost_of_goods, gross_profit, margin, created_at
    )
    values (
      admin_id, null, amount, qty, 'Unidad con licor',
      'unit', pv_id, amount,
      0, 0,
      cost_total, amount - cost_total, (amount - cost_total)::numeric / nullif(amount,0), sale_dt
    )
    returning id into new_sale;

    insert into public.sale_batch_consumptions (sale_id, batch_id, units, cost)
    values (new_sale, batch_with_alc[1 + (i % array_length(batch_with_alc, 1))], qty, cost_total);
  end loop;

  -- 10 ventas tipo "singleNoAlcohol"
  for i in 1..10 loop
    qty        := 1 + (i % 4);
    price_unit := 7000;
    amount     := price_unit * qty;
    cost_unit  := 1900;
    cost_total := cost_unit * qty;
    sale_dt    := now() - ((30 - i) || ' hours')::interval;

    insert into public.sales (
      created_by, ambassador_profile_id, amount, quantity, note,
      sale_type, pricing_version_id, price_total,
      commission_rate, commission_value,
      cost_of_goods, gross_profit, margin, created_at
    )
    values (
      admin_id, null, amount, qty, 'Unidad sin licor',
      'singleNoAlcohol', pv_id, amount,
      0, 0,
      cost_total, amount - cost_total, (amount - cost_total)::numeric / nullif(amount,0), sale_dt
    )
    returning id into new_sale;

    insert into public.sale_batch_consumptions (sale_id, batch_id, units, cost)
    values (new_sale, batch_no_alc[1 + (i % array_length(batch_no_alc, 1))], qty, cost_total);
  end loop;

  -- 8 ventas tipo "promo" (cada promo = 2 granizados)
  for i in 1..8 loop
    qty        := 1 + (i % 3);                 -- cantidad de promos
    price_unit := 12000;
    amount     := price_unit * qty;
    cost_unit  := 1100;
    cost_total := cost_unit * qty * 2;         -- 2 granizados por promo
    sale_dt    := now() - ((40 - i) || ' hours')::interval;

    insert into public.sales (
      created_by, amount, quantity, note,
      sale_type, pricing_version_id, price_total,
      cost_of_goods, gross_profit, margin, created_at
    )
    values (
      admin_id, amount, qty, 'Promo combo',
      'promo', pv_id, amount,
      cost_total, amount - cost_total, (amount - cost_total)::numeric / nullif(amount,0), sale_dt
    )
    returning id into new_sale;

    insert into public.sale_batch_consumptions (sale_id, batch_id, units, cost)
    values (new_sale, batch_with_alc[1 + (i % array_length(batch_with_alc, 1))], qty * 2, cost_total);
  end loop;

  -- 5 ventas tipo "gift" (precio 0, costo igual)
  for i in 1..5 loop
    qty        := 1 + (i % 2);
    amount     := 0;
    cost_unit  := 1100;
    cost_total := cost_unit * qty;
    sale_dt    := now() - ((50 - i) || ' hours')::interval;

    insert into public.sales (
      created_by, amount, quantity, note,
      sale_type, pricing_version_id, price_total,
      cost_of_goods, gross_profit, margin, created_at
    )
    values (
      admin_id, 0, qty, 'Regalo',
      'gift', pv_id, 0,
      cost_total, -cost_total, 0, sale_dt
    )
    returning id into new_sale;

    insert into public.sale_batch_consumptions (sale_id, batch_id, units, cost)
    values (new_sale, batch_with_alc[1 + (i % array_length(batch_with_alc, 1))], qty, cost_total);
  end loop;

  -- 12 ventas wholesale (con embajador, con descuento + comisión)
  for i in 1..12 loop
    qty        := 20 + (i * 5);          -- 25, 30, 35... hasta ~80
    price_unit := case when qty >= 50 then 4700 else 4900 end;
    amount     := price_unit * qty;      -- base
    cost_unit  := 1100;
    cost_total := cost_unit * qty;
    amb_id     := emba_ids[1 + (i % emba_count)];
    sale_dt    := now() - ((60 - i) || ' hours')::interval;

    insert into public.sales (
      created_by, ambassador_profile_id, amount, quantity, note,
      sale_type, wholesale_variant, pricing_version_id,
      price_total,
      wholesale_discount_pct, wholesale_discount_value, wholesale_net_total,
      wholesale_base_commission_pct, wholesale_boost_bonus_pct,
      commission_rate, commission_value,
      cost_of_goods, gross_profit, net_profit, margin, created_at
    )
    values (
      admin_id, amb_id, amount * 0.9, qty, 'Venta al por mayor',
      'wholesale', 'withAlcohol', pv_id,
      amount,
      0.10, amount * 0.10, amount * 0.90,
      0.15, 0,
      0.15, amount * 0.90 * 0.15,
      cost_total, amount * 0.90 - cost_total, (amount * 0.90 - cost_total) - (amount * 0.90 * 0.15), (amount * 0.90 - cost_total) / nullif(amount * 0.90, 0), sale_dt
    )
    returning id into new_sale;

    insert into public.sale_batch_consumptions (sale_id, batch_id, units, cost)
    values (new_sale, batch_with_alc[1 + (i % array_length(batch_with_alc, 1))], qty, cost_total);

    -- gasto comisión vinculado a la venta (sobre el neto, como el flujo real)
    insert into public.expenses (
      created_by, ambassador_profile_id, category, description, amount, expense_type, source_sale_id, created_at
    )
    values (
      admin_id, amb_id, 'comision_embajador',
      'Comisión venta mayorista ' || new_sale,
      amount * 0.90 * 0.15,
      'commission',
      new_sale,
      sale_dt
    );

    -- gasto descuento (contra-ingreso)
    insert into public.expenses (
      created_by, ambassador_profile_id, category, description, amount, expense_type, source_sale_id, created_at
    )
    values (
      admin_id, amb_id, 'descuento_cliente',
      'Descuento venta mayorista ' || new_sale,
      amount * 0.10,
      'discount',
      new_sale,
      sale_dt
    );
  end loop;

  -- -------------------------------------------------------------------
  -- 2d. CONSIGNACIONES (15 clientes, mezcla activos / históricos)
  -- -------------------------------------------------------------------
  client_ids := array[]::uuid[];

  for i in 1..15 loop
    new_client := gen_random_uuid();

    insert into public.consignment_clients (
      id, created_by, name, address, contact_name, phone, notes,
      base_quantity_with_alcohol, base_quantity_without_alcohol,
      price_with_alcohol, price_without_alcohol,
      next_replenishment_date, created_at
    )
    values (
      new_client,
      admin_id,
      case i
        when 1 then 'Supermercado El Tigre'
        when 2 then 'Tienda Don Pepe'
        when 3 then 'Mini Market La 14'
        when 4 then 'Licorera Central'
        when 5 then 'Cafetería La Esquina'
        when 6 then 'Heladería Polo Norte'
        when 7 then 'Tienda Mixta La Quinta'
        when 8 then 'Bar El Rincón'
        when 9 then 'Estación Terpel Norte'
        when 10 then 'Panadería La Espiga'
        when 11 then 'Pizzería Rómulo'
        when 12 then 'Tienda Doña Marta'
        when 13 then 'Café Internet Sky'
        when 14 then 'Restaurante La Casona'
        else 'Tienda Vecinal #' || i
      end,
      'Calle ' || (10 + i) || ' # ' || i || '-' || (20 + i) || ', Armenia',
      'Contacto ' || i,
      '+57 310 ' || lpad((100 + i * 11)::text, 3, '0') || ' ' || lpad((1000 + i * 7)::text, 4, '0'),
      case when i % 3 = 0 then 'Cliente frecuente, paga al contado' else null end,
      case when i <= 12 then 20 + (i * 2) else 0 end,                -- activos: i<=12
      case when i <= 12 then 15 + i      else 0 end,
      5000, 4800,
      (current_date + ((i % 14) - 5))::date,                        -- algunos vencidos, otros próximos
      now() - ((30 - i) || ' days')::interval
    );

    client_ids := array_append(client_ids, new_client);

    -- 2 reposiciones por cliente activo
    if i <= 12 then
      insert into public.consignment_replenishments (
        created_by, client_id,
        units_delivered_with_alcohol, units_delivered_without_alcohol,
        unit_price_with_alcohol, unit_price_without_alcohol,
        amount_charged,
        new_base_with_alcohol, new_base_without_alcohol,
        previous_base_with_alcohol, previous_base_without_alcohol,
        notes, created_at
      )
      values
        (admin_id, new_client,
         10, 8,
         5000, 4800,
         10 * 5000 + 8 * 4800,
         20 + (i * 2), 15 + i,
         15 + (i * 2), 10 + i,
         'Reposición rutinaria',
         now() - ((20 - i) || ' days')::interval),
        (admin_id, new_client,
         12, 10,
         5000, 4800,
         12 * 5000 + 10 * 4800,
         20 + (i * 2), 15 + i,
         18 + (i * 2), 13 + i,
         'Segunda reposición',
         now() - ((10 - (i % 9)) || ' days')::interval);
    end if;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------
-- Verificación rápida (corre por separado si quieres):
-- ---------------------------------------------------------------------
-- select 'lotes' as tipo, count(*) from public.production_batches
-- union all select 'embajadores', count(*) from public.profiles where role = 'embajador'
-- union all select 'ventas', count(*) from public.sales
-- union all select 'consignment_clients', count(*) from public.consignment_clients
-- union all select 'consignment_replenishments', count(*) from public.consignment_replenishments;
