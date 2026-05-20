-- ============================================================
-- SEED DE PRUEBAS — Módulo de Consignaciones
-- ============================================================
-- Ejecutar en: Supabase SQL Editor (con permisos de service_role)
-- Es IDEMPOTENTE: borra y recrea todos los registros TEST · *
-- ============================================================
--
-- CLIENTES QUE CREA:
--
--  1. TEST · B4 · La Tiendita     → base 80A, 0SA
--     Prueba: reponer con menos (30A), igual (80A), y más (100A)
--     Prueba también B2: recoger 0 unidades (cobrar 80 faltantes)
--
--  2. TEST · B1 · La Esquina      → base 100A (ya amplificada)
--     La entrega inicial fue 80A, luego se reponó con 100A (base 80→100)
--     Prueba B1: recoger 100 no debe dar "solo 80 disponibles"
--
--  3. TEST · B3 · El Multitienda  → base 80A (multi-lote: 50A Lote A + 30A Lote B)
--     Prueba B3: recoger 80A debe distribuir returns 50u→Lote A, 30u→Lote B
--
--  4. TEST · HIST · El Colmado    → base 0A (cerrado, ya recogido)
--     Prueba D2: ver historial desde cliente cerrado
--     Prueba D3: botón Reactivar presente, luego reactivar
--
-- LOTES QUE CREA:
--
--  TEST · Lote A (50u)   — withAlcohol, 50u, $3.000/u → costo $150.000
--  TEST · Lote B (600u)  — withAlcohol, 600u, $3.000/u → costo $1.800.000
--
-- ============================================================

DO $$
DECLARE
  v_admin_id          uuid;
  v_batch_a           uuid;
  v_batch_b           uuid;
  v_sale_id           uuid;
  v_sale_rep_id       uuid;
  v_client_b4         uuid;
  v_client_b1         uuid;
  v_client_b3         uuid;
  v_client_hist       uuid;
  v_pickup_id         uuid;
BEGIN

  -- ── 0. LIMPIEZA PREVIA (idempotente) ─────────────────────────────
  DELETE FROM public.inventory_returns
  WHERE source_client_id IN (
    SELECT id FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  DELETE FROM public.consignment_pickups
  WHERE client_id IN (
    SELECT id FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  DELETE FROM public.consignment_replenishments
  WHERE client_id IN (
    SELECT id FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  -- Eliminar consumptions de sales de consignación de clientes TEST
  DELETE FROM public.sale_batch_consumptions
  WHERE sale_id IN (
    SELECT id FROM public.sales
    WHERE consignment_client_id IN (
      SELECT id FROM public.consignment_clients WHERE name LIKE 'TEST · %'
    )
  );

  -- Eliminar consumptions de sales iniciales (initial_sale_id_*)
  DELETE FROM public.sale_batch_consumptions
  WHERE sale_id IN (
    SELECT initial_sale_id_with_alcohol FROM public.consignment_clients WHERE name LIKE 'TEST · %'
    UNION
    SELECT initial_sale_id_without_alcohol FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  DELETE FROM public.sales
  WHERE consignment_client_id IN (
    SELECT id FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  DELETE FROM public.sales
  WHERE id IN (
    SELECT initial_sale_id_with_alcohol FROM public.consignment_clients WHERE name LIKE 'TEST · %'
    UNION
    SELECT initial_sale_id_without_alcohol FROM public.consignment_clients WHERE name LIKE 'TEST · %'
  );

  DELETE FROM public.consignment_clients WHERE name LIKE 'TEST · %';

  DELETE FROM public.production_batches WHERE label LIKE 'TEST · %';

  RAISE NOTICE '── Limpieza previa completada ──';


  -- ── 1. OBTENER ADMIN ─────────────────────────────────────────────
  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE role = 'admin' AND is_active = true
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un perfil admin activo en public.profiles';
  END IF;

  RAISE NOTICE 'Admin ID: %', v_admin_id;


  -- ── 2. LOTES DE PRODUCCIÓN ───────────────────────────────────────

  -- Lote A: 50 unidades (pequeño, se agota con el primer cliente multi-lote)
  INSERT INTO public.production_batches (
    created_at, created_by, label, variant, units_produced, total_cost, notes
  ) VALUES (
    NOW() - INTERVAL '30 days',
    v_admin_id,
    'TEST · Lote A (50u)',
    'withAlcohol',
    50,
    150000.00,
    'Lote de prueba — agotable por cliente B3 multi-lote'
  ) RETURNING id INTO v_batch_a;

  -- Lote B: 600 unidades (principal para todos los demás)
  INSERT INTO public.production_batches (
    created_at, created_by, label, variant, units_produced, total_cost, notes
  ) VALUES (
    NOW() - INTERVAL '25 days',
    v_admin_id,
    'TEST · Lote B (600u)',
    'withAlcohol',
    600,
    1800000.00,
    'Lote de prueba principal'
  ) RETURNING id INTO v_batch_b;

  RAISE NOTICE 'Lote A: % | Lote B: %', v_batch_a, v_batch_b;


  -- ═══════════════════════════════════════════════════════════════
  -- CLIENTE 1 — TEST · B4 · La Tiendita
  -- Base 80A. Pruebas: reponer <80, =80, >80 (ampliar base)
  --                    y recoger 0 unidades (cobrar 80 faltantes)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.consignment_clients (
    created_at, created_by, name, address, contact_name, phone,
    base_quantity_with_alcohol, base_quantity_without_alcohol,
    price_with_alcohol, price_without_alcohol,
    next_replenishment_date
  ) VALUES (
    NOW() - INTERVAL '20 days',
    v_admin_id,
    'TEST · B4 · La Tiendita',
    'Cra 10 #5-20, Bogotá',
    'Don Carlos',
    '3001234567',
    80, 0,
    4900, 4800,
    (CURRENT_DATE + INTERVAL '15 days')::date
  ) RETURNING id INTO v_client_b4;

  -- Entrega inicial: 80A del Lote B
  INSERT INTO public.sales (
    created_at, created_by,
    sale_type, wholesale_variant, quantity, amount,
    price_total, wholesale_net_total,
    cost_of_goods, gross_profit, net_profit, margin,
    consignment_client_id
  ) VALUES (
    NOW() - INTERVAL '20 days', v_admin_id,
    'consignment', 'withAlcohol', 80, 0,
    0, 0,
    240000.00, -240000.00, -240000.00, 0,
    v_client_b4
  ) RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_batch_consumptions (sale_id, batch_id, units, cost)
  VALUES (v_sale_id, v_batch_b, 80, 240000.00);

  UPDATE public.consignment_clients
  SET initial_sale_id_with_alcohol = v_sale_id
  WHERE id = v_client_b4;

  RAISE NOTICE 'Cliente B4 creado: % (base 80A)', v_client_b4;


  -- ═══════════════════════════════════════════════════════════════
  -- CLIENTE 2 — TEST · B1 · La Esquina
  -- Base 100A (fue 80A, se amplió con una reposición de 100A).
  -- Prueba B1: recoger 100 no debe dar error "solo 80 disponibles".
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.consignment_clients (
    created_at, created_by, name, address, contact_name,
    base_quantity_with_alcohol, base_quantity_without_alcohol,
    price_with_alcohol, price_without_alcohol,
    next_replenishment_date
  ) VALUES (
    NOW() - INTERVAL '18 days',
    v_admin_id,
    'TEST · B1 · La Esquina',
    'Cll 23 #8-15, Bogotá',
    'Doña Rosa',
    100, 0,
    4900, 4800,
    (CURRENT_DATE + INTERVAL '10 days')::date
  ) RETURNING id INTO v_client_b1;

  -- Entrega inicial: 80A del Lote B
  INSERT INTO public.sales (
    created_at, created_by,
    sale_type, wholesale_variant, quantity, amount,
    price_total, wholesale_net_total,
    cost_of_goods, gross_profit, net_profit, margin,
    consignment_client_id
  ) VALUES (
    NOW() - INTERVAL '18 days', v_admin_id,
    'consignment', 'withAlcohol', 80, 0,
    0, 0,
    240000.00, -240000.00, -240000.00, 0,
    v_client_b1
  ) RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_batch_consumptions (sale_id, batch_id, units, cost)
  VALUES (v_sale_id, v_batch_b, 80, 240000.00);

  UPDATE public.consignment_clients
  SET initial_sale_id_with_alcohol = v_sale_id
  WHERE id = v_client_b1;

  -- Reposición: entregó 100A, cobró 80 (base anterior) × $4.900 = $392.000
  -- Los 100A nuevos consumen del Lote B
  INSERT INTO public.sales (
    created_at, created_by,
    sale_type, wholesale_variant, quantity, amount,
    price_total, wholesale_net_total,
    cost_of_goods, gross_profit, net_profit, margin,
    consignment_client_id
  ) VALUES (
    NOW() - INTERVAL '8 days', v_admin_id,
    'consignment', 'withAlcohol', 100, 392000.00,
    392000.00, 392000.00,
    300000.00, 92000.00, 92000.00, 0.2347,
    v_client_b1
  ) RETURNING id INTO v_sale_rep_id;

  INSERT INTO public.sale_batch_consumptions (sale_id, batch_id, units, cost)
  VALUES (v_sale_rep_id, v_batch_b, 100, 300000.00);

  INSERT INTO public.consignment_replenishments (
    created_at, created_by, client_id,
    units_delivered_with_alcohol, units_delivered_without_alcohol,
    unit_price_with_alcohol, unit_price_without_alcohol,
    amount_charged,
    new_base_with_alcohol, new_base_without_alcohol,
    sale_id_with_alcohol,
    notes
  ) VALUES (
    NOW() - INTERVAL '8 days', v_admin_id, v_client_b1,
    100, 0,
    4900, 4800,
    392000.00,
    100, 0,
    v_sale_rep_id,
    'Amplió base 80→100 (datos de prueba B1)'
  );

  RAISE NOTICE 'Cliente B1 creado: % (base 100A, amplificada)', v_client_b1;


  -- ═══════════════════════════════════════════════════════════════
  -- CLIENTE 3 — TEST · B3 · El Multitienda
  -- Base 80A cubriendo DOS lotes: 50A del Lote A + 30A del Lote B.
  -- Prueba B3: al recoger 80A los returns deben ir 50→LoteA, 30→LoteB.
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.consignment_clients (
    created_at, created_by, name, address, contact_name,
    base_quantity_with_alcohol, base_quantity_without_alcohol,
    price_with_alcohol, price_without_alcohol,
    next_replenishment_date
  ) VALUES (
    NOW() - INTERVAL '28 days',
    v_admin_id,
    'TEST · B3 · El Multitienda',
    'Av 45 #12-8, Bogotá',
    'Don Pedro',
    80, 0,
    4900, 4800,
    (CURRENT_DATE + INTERVAL '5 days')::date
  ) RETURNING id INTO v_client_b3;

  -- Entrega inicial: 80A abarcando ambos lotes (50A Lote A + 30A Lote B)
  INSERT INTO public.sales (
    created_at, created_by,
    sale_type, wholesale_variant, quantity, amount,
    price_total, wholesale_net_total,
    cost_of_goods, gross_profit, net_profit, margin,
    consignment_client_id
  ) VALUES (
    NOW() - INTERVAL '28 days', v_admin_id,
    'consignment', 'withAlcohol', 80, 0,
    0, 0,
    240000.00, -240000.00, -240000.00, 0,
    v_client_b3
  ) RETURNING id INTO v_sale_id;

  -- CLAVE: dos filas de consumptions — una por lote
  INSERT INTO public.sale_batch_consumptions (sale_id, batch_id, units, cost)
  VALUES
    (v_sale_id, v_batch_a, 50, 150000.00),   -- 50u × $3.000 del Lote A
    (v_sale_id, v_batch_b, 30,  90000.00);   -- 30u × $3.000 del Lote B

  UPDATE public.consignment_clients
  SET initial_sale_id_with_alcohol = v_sale_id
  WHERE id = v_client_b3;

  RAISE NOTICE 'Cliente B3 creado: % (base 80A, multi-lote A50+B30)', v_client_b3;


  -- ═══════════════════════════════════════════════════════════════
  -- CLIENTE 4 — TEST · HIST · El Colmado
  -- Cerrado (base=0). Tuvo 80A, se recogieron todos sin faltantes.
  -- Prueba D2: historial debe mostrar entrega + recogida.
  -- Prueba D3: debe mostrar botones Historial y Reactivar (no Editar/Reponer/Recoger).
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.consignment_clients (
    created_at, created_by, name, address, contact_name, phone,
    base_quantity_with_alcohol, base_quantity_without_alcohol,
    price_with_alcohol, price_without_alcohol,
    next_replenishment_date
  ) VALUES (
    NOW() - INTERVAL '15 days',
    v_admin_id,
    'TEST · HIST · El Colmado',
    'Cll 7 #3-10, Bogotá',
    'Doña Marta',
    '3109876543',
    0, 0,
    4900, 4800,
    CURRENT_DATE
  ) RETURNING id INTO v_client_hist;

  -- Entrega inicial: 80A del Lote B
  INSERT INTO public.sales (
    created_at, created_by,
    sale_type, wholesale_variant, quantity, amount,
    price_total, wholesale_net_total,
    cost_of_goods, gross_profit, net_profit, margin,
    consignment_client_id
  ) VALUES (
    NOW() - INTERVAL '15 days', v_admin_id,
    'consignment', 'withAlcohol', 80, 0,
    0, 0,
    240000.00, -240000.00, -240000.00, 0,
    v_client_hist
  ) RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_batch_consumptions (sale_id, batch_id, units, cost)
  VALUES (v_sale_id, v_batch_b, 80, 240000.00);

  UPDATE public.consignment_clients
  SET initial_sale_id_with_alcohol = v_sale_id
  WHERE id = v_client_hist;

  -- Pickup: recogió 80A exactos, 0 faltantes, $0 cobrado
  INSERT INTO public.consignment_pickups (
    created_at, created_by, client_id,
    units_collected_with_alcohol, units_collected_without_alcohol,
    units_charged_with_alcohol,   units_charged_without_alcohol,
    unit_price_with_alcohol, unit_price_without_alcohol,
    amount_charged,
    notes
  ) VALUES (
    NOW() - INTERVAL '5 days', v_admin_id, v_client_hist,
    80, 0,
    0, 0,
    4900, 4800,
    0,
    'Recogida completa sin faltantes (datos de prueba D2/D3)'
  ) RETURNING id INTO v_pickup_id;

  -- Inventory returns: 80A regresan al Lote B
  INSERT INTO public.inventory_returns (
    created_at, created_by,
    batch_id, variant, units,
    source_pickup_id, source_client_id
  ) VALUES (
    NOW() - INTERVAL '5 days', v_admin_id,
    v_batch_b, 'withAlcohol', 80,
    v_pickup_id, v_client_hist
  );

  RAISE NOTICE 'Cliente HIST creado: % (cerrado, base=0)', v_client_hist;


  -- ── RESUMEN FINAL ─────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  SEED COMPLETADO';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '  LOTES:';
  RAISE NOTICE '    TEST · Lote A (50u)   id: %', v_batch_a;
  RAISE NOTICE '    TEST · Lote B (600u)  id: %', v_batch_b;
  RAISE NOTICE '';
  RAISE NOTICE '  CLIENTES:';
  RAISE NOTICE '    B4 La Tiendita   (base 80A)         id: %', v_client_b4;
  RAISE NOTICE '    B1 La Esquina    (base 100A amplif.) id: %', v_client_b1;
  RAISE NOTICE '    B3 El Multitienda(base 80A 2 lotes)  id: %', v_client_b3;
  RAISE NOTICE '    HIST El Colmado  (cerrado, base=0)   id: %', v_client_hist;
  RAISE NOTICE '';
  RAISE NOTICE '  INVENTARIO ESPERADO EN DASHBOARD:';
  RAISE NOTICE '    unitsRemaining ≈ 150 (Lote B: 600-450+80retornados=230, Lote A: 0)';
  RAISE NOTICE '    consignedWithAlcohol = 360 (80+100+80+0)';
  RAISE NOTICE '════════════════════════════════════════════════════';

END $$;


-- ============================================================
-- VERIFICACIÓN POST-SEED (opcional, ejecutar por separado)
-- ============================================================
/*

-- Ver clientes creados con su estado
SELECT
  name,
  base_quantity_with_alcohol   AS base_a,
  base_quantity_without_alcohol AS base_sa,
  price_with_alcohol,
  next_replenishment_date
FROM public.consignment_clients
WHERE name LIKE 'TEST · %'
ORDER BY created_at;


-- Ver lotes creados
SELECT label, variant, units_produced, total_cost
FROM public.production_batches
WHERE label LIKE 'TEST · %'
ORDER BY created_at;


-- Ver consumptions por cliente (para verificar multi-lote B3)
SELECT
  c.name AS cliente,
  pb.label AS lote,
  sbc.units,
  sbc.cost
FROM public.consignment_clients c
JOIN public.sales s ON s.consignment_client_id = c.id
JOIN public.sale_batch_consumptions sbc ON sbc.sale_id = s.id
JOIN public.production_batches pb ON pb.id = sbc.batch_id
WHERE c.name LIKE 'TEST · %'
ORDER BY c.name, pb.created_at;


-- Ver inventory_returns del cliente HIST
SELECT
  ir.units, ir.variant,
  pb.label AS lote_destino,
  cp.notes AS pickup_notes
FROM public.inventory_returns ir
JOIN public.production_batches pb ON pb.id = ir.batch_id
JOIN public.consignment_clients c ON c.id = ir.source_client_id
LEFT JOIN public.consignment_pickups cp ON cp.id = ir.source_pickup_id
WHERE c.name LIKE 'TEST · HIST · %';

*/
