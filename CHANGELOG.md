# Changelog

## [0.15.1] - 2026-07-19

Auditoría técnica del money-path (ver `TECHNICAL_AUDIT.md`). Correcciones de correctitud sin
migración; el endurecimiento atómico de FIFO (#3) queda pendiente de decisión y validación en staging.

### Fixed

- **Sobreventa silenciosa de inventario (#1)** — `resolveFifoCost` ahora reporta cobertura
  (`covered`/`shortfall`/`sufficient`) y `POST /api/sales` rechaza la venta (409) cuando el stock del
  variante no alcanza, con mensaje del disponible real. Antes la venta se registraba igual, dejando
  unidades con costo $0 y sobrestimando utilidad bruta/neta.
- **Nivel de embajador desactualizado en el panel admin (#2)** — `AmbassadorsPanel` calcula el nivel
  del ciclo vigente (compute-on-read, igual que el panel del embajador) en lugar de leer la columna
  `profiles.level`, que quedaba congelada en "Nivel 0" tras la creación. La columna almacenada deja de
  usarse para mostrar el nivel.
- **Comisión mostrada por recálculo en vez del snapshot inmutable (#5)** — el ledger muestra la
  comisión persistida en la venta (espejo del gasto tipo `commission`) en vez de recalcularla en cada
  render. Antes, si un embajador con ventas se borraba o renombraba, la fila mostraba $0 de comisión
  aunque el gasto siguiera registrado. No cambia ningún total.

### Rendimiento

- **Índices en rutas calientes (#4)** — migración `0013_perf_indexes.sql` añade índices en
  `sales (ambassador_profile_id, sale_type)`, `sales (created_at)`, `expenses (ambassador_profile_id)`,
  `sale_batch_consumptions (sale_id)` e `inventory_returns (source_client_id, variant)`. Aceleran la
  liquidación, el panel del embajador y la carga del dashboard. No destructiva e idempotente.
- **Cálculo de stock en consignación paralelizado (#4)** — `computeAllClientsStockCogs` y
  `computeClientBatchOutstanding` (`src/lib/consignment-traceability.ts`) resuelven sus consultas
  independientes con `Promise.all` en vez de en serie. Antes eran ~6 round-trips secuenciales por
  cliente×variante, en serie entre clientes (el N+1 que hacía lenta la carga del admin). Mismo
  resultado, mucha menos latencia.

### Nota de auditoría

- La condición de carrera de FIFO (#3, consumo lee-y-luego-escribe sin lock) queda **diferida**: hoy
  la app es de un solo escritor (el admin registra ventas en serie), así que no aplica. Se convierte en
  requisito cuando `trabix-bot` escriba ventas en esta misma BD — ahí el consumo FIFO debe volverse una
  función atómica de Postgres. Detalle completo en `TECHNICAL_AUDIT.md`.

## [0.15.0] - 2026-06-27

### Added

- **Gamificación del panel del embajador** — el panel read-only ahora muestra nivel con badge por
  identidad visual (Plata/Oro/Diamante), barra de progreso al siguiente nivel, días restantes del
  ciclo, recap del ciclo actual e historial ciclo a ciclo. Lógica en `src/lib/levels.ts`
  (compute-on-read, sin persistencia nueva para la parte visual).
- **Ciclo personal de 30 días** — el nivel se mide por unidades vendidas dentro de una ventana de 30
  días anclada a la `created_at` (fecha de ingreso) de cada embajador; se reinicia a Nivel 0 cada
  ciclo. Cada embajador tiene su propio ciclo. La fecha de ingreso se muestra en el hero.
- **% de comisión por venta** — cada card de venta mayorista muestra su tasa real (tier de cantidad
  20+/50+/100+ + boost). Las ventas con boost usan un estilo destacado (degradado naranja→rosa→
  violeta), igual que la card "Recta final".
- **Card "Recta final"** — en los últimos 5 días del ciclo (si el nivel da sueldo base), el embajador
  ve un aviso con sus recompensas reclamables (granizados gratis + sueldo base + comisiones).
- **Fase 2 — Liquidación de sueldo base** — al cerrar un ciclo, el admin liquida el sueldo base del
  nivel alcanzado desde `AmbassadorsPanel` (botón por ciclo cerrado pendiente). Crea un gasto **único**
  (`oneTime`) ligado al embajador (baja la utilidad neta) con el embajador y nivel en el título
  (`Sueldo base {Nivel} · {Embajador}`) y registra la liquidación.
  - Migración `0012_ambassador_payouts.sql`: tabla `ambassador_payouts` (idempotente por
    `(ambassador_profile_id, cycle_start)`) + RLS (admin all, embajador read own).
  - Ruta `POST /api/embajadores/liquidar`: recomputa nivel y monto server-side, solo ciclos cerrados.
  - El historial del embajador marca cada ciclo como "Liquidado" o "Pendiente".
- **Autoconsumo de granizados gratis** — al liquidar, los granizados gratis del nivel (5/7/10) se
  registran automáticamente como una venta `gift` con nota "Regalo a embajador {nombre} · {nivel}",
  siguiendo el flujo normal: consumen inventario FIFO y su costo baja la utilidad bruta.
- **Card "Desde que ingresaste" (vista embajador)** — muestra el total generado de por vida (comisiones
  + sueldos base) más unidades vendidas y granizados gratis acumulados, con la fecha de ingreso.

### Fixed

- **Redirects del servidor respetan el host real** — `src/lib/api-utils.ts` (`resolveRequestOrigin`/
  `requestUrl`), la ruta de login y el middleware derivan el origin del header `Host` en vez de
  `request.url` (que el dev server resuelve a `localhost`). Antes, el login desde otro dispositivo en
  la LAN redirigía a `localhost` y fallaba.
- **Acceso por LAN en desarrollo** — `next.config.mjs` añade `allowedDevOrigins` para que el bundle
  cliente / HMR carguen al abrir el dev server desde una IP de red (p. ej. un celular).

## [0.14.0] - 2026-05-31

### Added

- **Campos de cliente y domicilio en ventas al por mayor** — el formulario de venta al por mayor ahora incluye: nombre del cliente/negocio, dirección de entrega, teléfono y precio de domicilio (todos opcionales).
  - El domicilio aparece como línea separada en el resumen previo del formulario y en el TOTAL de la factura PDF.
  - La factura PDF muestra un bloque CLIENTE (nombre, teléfono, dirección) antes de los detalles del producto, si hay datos de cliente.
  - El historial de facturas muestra el nombre del cliente en el `subject` de cada entrada.
  - Migración `0011_wholesale_client_fields.sql`: agrega `client_name`, `client_address`, `client_phone`, `delivery_fee` a la tabla `sales`.

## [0.13.0] - 2026-05-30

### Performance

- **`ConsignacionesPanel` sin `router.refresh()`** — crear cliente, editar, reponer, recoger y reactivar ahora actualizan el estado React local directamente desde la respuesta JSON, completando la migración iniciada en 0.12.0.
  - Rutas `/api/consignaciones`, `/api/consignaciones/reponer`, `/api/consignaciones/recoger` y `/api/consignaciones/reactivar` devuelven los registros creados (`client`, `replenishment`, `pickup`, `reactivation`, `sales`, `consumptions`, `inventoryReturns`) y los campos actualizados del cliente (`clientUpdate`).
  - Nuevos mappers en `src/lib/state-mappers.ts`: `mapApiConsignmentClient`, `mapApiConsignmentReplenishment`, `mapApiConsignmentPickup`, `mapApiConsignmentReactivation`, `mapApiInventoryReturn`.
  - `ConsignacionesPanel` migrado de `onRefresh` a `onStateUpdate` — ahora consistente con todos los demás paneles.

### Known limitations

- La métrica "Stock en consignación" (hero del dashboard) se actualiza solo al recargar la página completa porque su cálculo es server-side (N+1 queries). No cambia entre mutaciones de consignación en la sesión actual.

## [0.12.0] - 2026-05-30

### Performance

- **Eliminación de `router.refresh()` en mutaciones** — cada acción del admin (registrar venta, lote, gasto, embajador, boost, configuración, datos de empresa) ahora actualiza el estado React local directamente desde la respuesta JSON de la API, sin re-ejecutar los 14 queries SSR del dashboard. Tiempo post-acción reducido de ~2–4 s a ~50 ms.
  - Rutas API (`/api/sales`, `/api/batches`, `/api/expenses`, `/api/profiles`, `/api/embajadores`, `/api/embajadores/boost`, `/api/settings`, `/api/company-info`) ahora devuelven los registros insertados/modificados en la respuesta JSON.
  - Nuevo `src/lib/state-mappers.ts` con funciones de mapeo compartidas entre `admin/page.tsx` y los panels del cliente (`mapApiSale`, `mapApiExpense`, `mapApiBatch`, `mapApiSaleBatchConsumption`, `mapApiAmbassador`).
  - Panels (`SalesPanel`, `ProductionPanel`, `ExpensesPanel`, `AmbassadorsPanel`, `SettingsPanel`) migrados a `onStateUpdate` con merge local; `ConsignacionesPanel` conserva `onRefresh` por su complejidad transaccional.
- **Fast-path en auth de API** — `getRouteAuthContext` en `src/lib/route-auth.ts` ahora verifica primero la cookie `trabix-session` (HMAC-SHA256 ya verificada por middleware). Si es válida, salta el round-trip de red a Supabase Auth (`getUser()`), ahorrando ~100–300 ms en cada request autenticado.

### Changed

- `ConsignacionesPanel` ordena los clientes por urgencia de reposición (vencidos/más próximos primero; cerrados al final) en lugar de mostrar una alerta urgente separada. El banner de alertas fue eliminado.
- Métric cards del header del dashboard cambian de `grid` a `flex-wrap` para mejor comportamiento responsivo en pantallas intermedias.
- `table-card` recibe fondo (`rgba(255,255,255,0.38)`) y borde explícito para diferenciarse del fondo de panel.
- Pills de tipo de venta más compactas (alto reducido de 48 px a 38 px).
- Resumen semanal pasa a grid de 5 columnas (era 2); responsive a 2 cols en mobile.
- Footer del dashboard reorganizado con `footer-note-header` (título centrado, fecha alineada a la derecha), adaptado a una columna en mobile.

### Added

- Nuevas clases CSS: `scroll-card`, `scroll-card-fill`, `consignment-cards-scroll` para contenedores con scroll interno en consignaciones; `form-price-preview`, `table-head-meta`, `notes-toggle`, `row-auto`, `row-auto-tag`, `mini-box-label`, `mini-box-icon`.
- `scripts/seed-test-data.sql` — seed completo en volumen para pruebas: 12 lotes (mezcla con/sin licor), 12 embajadores con auth (contraseña `Trabix123!`), ~60 ventas variadas y 15 clientes de consignación con reposiciones. Destructivo: limpia datos existentes antes de insertar.

### Removed

- `scripts/seed-lotes.sql` — reemplazado por `seed-test-data.sql`.

## [0.11.0] - 2026-05-28

### Added

- **Sistema de facturación PDF** — cada venta al por mayor y cada acción de consignación (entrega inicial, reposición, recogida, reactivación) genera una factura descargable con branding Trabix.
  - Supabase migrations `0008_company_info.sql` (datos legales de la empresa singleton + seed), `0009_consignment_reactivations.sql` (auditoría de reactivaciones para soportar facturas RA), `0010_replenishment_previous_base.sql` (base anterior por variante para diferenciar reposición vs ampliación en facturas).
  - Lib `src/lib/invoice/` con tipos discriminados por kind, builders desde el state, numeración consecutiva on-demand por tipo (VM, EC, RC, RG, RA) y generador PDF con `jspdf` + `jspdf-autotable` (A5 vertical, logo Trabix circular).
  - Componentes `InvoiceSuccessModal` (modal pequeño con número y descarga) e `InvoiceHistoryModal` (tabla scrolleable con filtros por tipo, Ver/Descargar PDF). Ambos renderizados vía `createPortal` a `document.body` para evitar el stacking context del panel.
  - API `GET/PUT /api/company-info` para administrar los datos que aparecen en el header de cada factura.
  - Sub-sección "Datos de la empresa (factura)" en el panel de Configuración.
  - El endpoint `/api/consignaciones/reactivar` ahora también inserta en `consignment_reactivations` para historial auditable.
  - El endpoint `/api/consignaciones/reponer` guarda `previous_base_with_alcohol/without_alcohol` para que la factura distinga lo cobrado por reposición de la ampliación de base sin cobro.
  - Botón "Facturas (N)" en el header de los paneles de Ventas y Consignaciones para abrir el historial filtrado.
  - Tabla "AMPLIACIÓN DE BASE" condicional en facturas de reposición, solo cuando el cliente recibe más unidades de las que tenía como base.

### Changed

- Wholesale invoice: el bloque "EMBAJADOR / nombre" se reemplazó por "Código de descuento (X%): CODE" que solo se muestra cuando hay descuento aplicado.
- Layout de totales en PDF: helper `drawSummaryLine` con doble right-align y 32mm reservados para el value, eliminando el overlap entre el label y el monto cuando el label es largo (ej. "Descuento (12%):", "Cobrado por base anterior:").
- Tabla DETALLES de reposición: cuando hay base anterior registrada, las filas se splittean en "reposición de base" (cobrada) por variante. La ampliación se muestra en una segunda tabla con `+N` y "Sin cobro".
- `ConsignacionesPanel` ahora recibe `state: AppState` completo en lugar de campos individuales, simplificando el wiring.
- `AppState` incluye `companyInfo` y `consignmentReactivations`; `app/admin/page.tsx` carga ambos en el `Promise.all` inicial.

### Removed

- `scripts/bootstrap-admin.mjs` y sus referencias (`seed:admin` / `seed:admin:prod` en `package.json`, `ALLOW_BOOTSTRAP_ADMIN` en `CLAUDE.md` y `README.md`, callouts y menciones del bootstrap script en `README.md`). En su reemplazo, el admin inicial se crea desde la Supabase Auth dashboard + insert manual en `public.profiles`.
- Línea final "Nueva base: XA / YSA" de las facturas de reposición: solo aparece como tabla de ampliación cuando aplica.

### Added (scripts)

- `scripts/seed-lotes.sql` — SQL ejecutable en Supabase para limpiar lotes, ventas, consignaciones y gastos auto-generados, y sembrar 4 lotes (2 con licor a $1,000/u, 2 sin licor a $2,000/u, 100 uds c/u).

## [0.10.0] - 2026-05-27

### Added

- **Consignaciones module** — full operational flow for placing inventory in third-party establishments and reconciling on pickup.
  - Supabase migrations `0005_consignaciones.sql`, `0006_consignaciones_fix.sql`, `0007_consignaciones_pickup.sql` add `consignment_clients`, `consignment_replenishments`, `consignment_pickups`, `inventory_returns` tables and supporting columns.
  - Admin panel `ConsignacionesPanel` to create, edit, replenish, pickup, reactivate, and view history per client.
  - API routes: `POST /api/consignaciones` (create/update), `POST /api/consignaciones/reponer` (weekly replenishment), `POST /api/consignaciones/recoger` (pickup with shortage charge), `POST /api/consignaciones/reactivar` (reopen closed client preserving history).
  - FIFO batch traceability per client per variant (`computeClientBatchOutstanding`) so returns at pickup credit the correct production batch.
  - Initial deliveries record `consignment` sales with amount=0 (stock in transit, no revenue). Replenishments charge based on units delivered. Pickups charge shortages at the per-client unit price.
  - Dashboard card "Stock en consignación" shows the production cost currently held by establishments (`consignmentStockCogs`), computed server-side from outstanding × unit cost per client.
  - Sales registry shows pickup events as $0 virtual rows alongside real sales, with explicit labels for entrega inicial / reposición / cobro faltantes.
  - Test seed `scripts/seed-test-consignaciones.sql` for QA scenarios (multi-batch returns, historical clients, base amplification).

### Changed

- Cost of goods in the global ledger is now computed as `investment − stockOnHand − consignmentStockCogs`, robust to `inventory_returns` (units returned to stock no longer double-count as COGS).
- `resolveFifoCost` credits batches with `inventory_returns` so stock returned at pickup is available again for future FIFO consumption.
- `calculateLedger` replaces simulated FIFO with deterministic arithmetic over real `sale_batch_consumptions` and `inventory_returns` records.

### Fixed

- Pre-flight stock validation on all consignment routes prevents partial states when the second variant lacks stock after the first has already consumed FIFO.
- Retry-once + rollback wraps every critical DB step in the four consignment routes — if any link fails, created sales, replenishments, pickups, and returns are deleted.
- Shortage charges at pickup now extract real FIFO cost oldest-first from the client's outstanding (instead of `cost_of_goods=0`), so margins reflect reality.
- Shortage charge inserts use `quantity=faltantes` with `consumeStock=false` (was `quantity=0`, which violated the `CHECK (quantity > 0)` constraint and silently dropped the pickup).
- Replenishment base no longer drops below the previous base when delivering fewer units than the current base.
- Closed clients (`base=0`) hide Editar/Reponer/Recoger and show Historial/Reactivar instead, preserving their `client_id` and full history.
- Outstanding calculation switched from `sum(deliveries) − sum(returns)` to `totalDelivered − currentBase`, fixing inflated outstanding when the base is amplified and naturally handling multi-batch returns.

## [0.9.0] - 2026-05-09

### Changed

- Extracted shared API helpers (`setRedirect`, `wantsJson`, `jsonResponse`, `isMissingColumnError`, `isProfileBoostActive`) into `src/lib/api-utils.ts`, eliminating copy-paste across 9 route files.
- Added `src/lib/constants.ts` with business constants (`WHOLESALE_MIN_QUANTITY`, `BOOST_DURATION_DAYS`, `PROMO_UNITS_MULTIPLIER`, `MISSING_COLUMN_PG_CODES`).
- Consolidated admin-only auth blocks in `expenses`, `profiles`, and `embajadores` routes to use `requireRouteRole`.
- Narrowed `select("*")` to explicit column lists in `route-auth.ts`, `auth.ts`, `session/route.ts`, and `reset-password/route.ts`.
- Removed duplicate `normalizeLoginIdentifier` export from `rate-limit.ts`; now imports from `identity.ts`.
- Split `admin-dashboard.tsx` (1813 lines) into an orchestrator (294 lines) plus 5 focused panel components under `app/admin/components/`.
- Removed dead helper functions (`buildCommissionExpense`, `buildDiscountExpense`, `mutateState`) that were never called from JSX.

## [0.8.2] - 2026-05-06

### Changed

- Updated the admin financial summary to separate venta base, ingresos netos, descuentos, costo de producción, comisiones, gastos manuales, utilidad bruta, and utilidad neta.
- Recomputed dashboard net profit as utilidad bruta minus commissions and manual expenses, keeping discounts outside expenses so they are not subtracted twice.
- Updated the weekly admin summary to use the same financial language for ingresos netos, utilidad, commissions, and manual expenses.

## [0.8.1] - 2026-05-06

### Changed

- Added first-level admin financial cards for discounts and embajador commissions without changing profit formulas.

## [0.8.0] - 2026-05-06

### Changed

- Redesigned the app with the public Trabix Granizados brand style, including the light frost palette, glass surfaces, colorful action states, and `Baloo 2` / `Paytone One` typography.
- Added the Trabix logo asset to the login, password-change, admin, and embajador experiences.
- Updated admin, embajador, and auth surfaces to use the brighter Trabix visual system without changing routes, auth, Supabase access, or business logic.
- Simplified the login and password-change screens to centered branding with minimal auth forms, an explicit password requirement hint, and stronger login logo contrast.
- Simplified the desktop admin layout by removing the sidebar and moving logout into the main tab navigation row.
- Refined the embajador hero with centered branding, prominent ambassador code, a compact red logout control, and gross sales as the primary total.
- Adjusted embajador boost copy to avoid admin-facing language and show wholesale sale prices before discounts first.

## [0.7.0] - 2026-05-05

### Added

- Supabase migration for persisted embajador boost state, linked sale expenses, and nullable net-profit snapshots.
- Admin-only boost toggle route and dashboard button to activate a 7-day boost or cancel an active boost.
- Automatic linked discount and commission expense records for new embajador wholesale sales.

### Changed

- New sales now treat `price_total` as venta base and `amount` / `wholesale_net_total` as venta real after discounts.
- New commission snapshots are calculated on venta real and include the configured `Boost extra` when the embajador has an active boost.
- New net-profit and margin snapshots use `venta real - costo FIFO - comisión` and `utilidad neta / venta real`.
- Dashboard and weekly summaries now report ingresos as venta real and keep discounts visible without subtracting them twice from net profit.
- Dashboard mappers now tolerate databases that have not yet applied the new nullable columns, and affected APIs return an explicit migration-required error.
- Embajador dashboard now uses a mobile-first layout with supported app styles, compact assigned-sale cards, and visible boost status.

## [0.6.0] - 2026-05-05

### Added

- Supabase schema for persisted production batches, batch items, pricing versions, wholesale tiers, sale FIFO consumptions, sale snapshots, embajador level, and forced password changes.
- Admin routes for batch persistence, pricing-version saves, server-generated embajador temporary passwords, password reset, and password-change enforcement.
- `/cambiar-contrasena` flow that requires temporary-password users to set a permanent password with minimum security rules.
- Embajador dashboard summary for assigned wholesale sales, commissions, client savings, units, level, and profile details.

### Changed

- Admin embajador creation now collects name, code, and phone only; username is always generated from the code and new embajadores start at `nivel0`.
- Admin sales now calculate and store pricing, discount, commission, cost, profit, margin, and pricing-version snapshots on the backend.
- Production lots and pricing settings now persist in Supabase instead of remaining visual-only dashboard state.
- Existing sales keep their stored snapshots, so future pricing changes affect only new records.
- Supabase local configuration now matches the remote Postgres 17 project.

## [0.5.0] - 2026-05-04

### Changed

- Restored `/admin` to the full operational dashboard layout while loading `profiles`, `sales`, and `expenses` from Supabase.
- Replaced local dashboard actions for sales, expenses, embajador creation, profile edits, and logout with authenticated backend calls.
- Preserved visual-only lot, pricing, boost, and advanced FIFO controls without treating them as persisted Supabase data.

### Added

- JSON responses for dashboard calls to embajador creation, sales, expenses, and profile update route handlers.
- Immediate one-time credential display after creating an embajador with username/code and initial password.
- Signed lightweight `trabix-session` cookie fallback for reliable server-side profile resolution after login.

## [0.4.0] - 2026-04-28

### Added

- Username/code login with hidden Supabase Auth aliases under `trabix.local`.
- Admin-only embajador creation with username, full name, phone, code, and password.
- Dev-only bootstrap script for the local admin user `samuel / samuel123`.
- `.env.local` template with Supabase service role and alias-domain settings.

### Changed

- Removed the public signup flow from the login screen.
- Updated login rate limiting to key by username/IP instead of email/IP.
- Removed email from the user-facing admin and embajador dashboards.
- Updated repository docs and package versioning for the new login model.

## [0.3.0] - 2026-04-28

### Added

- Upstash Redis-backed rate limiting for login and embajador surfaces.
- Per-IP and per-username/IP throttles on the login flow.
- Per-user/IP throttling for embajador page access and embajador sales submissions.
- 429 responses with retry hints for blocked requests.
- Login UI feedback for rate limit and service-unavailable states.

### Changed

- Login now supports JSON responses for the client-side form flow while preserving normal redirects for non-JS submissions.
- Repository docs now include the Upstash environment variables and the new abuse-protection behavior.

## [0.2.0] - 2026-04-28

### Added

- Supabase Auth with role-based dashboards for `admin` and `embajador`.
- Server-side session handling, route protection, and RLS-backed data access.
- Local Supabase migration and Docker support for repeatable development.
- Repository governance files: `AGENTS.md`, `CHANGELOG.md`, and a restrictive license.

### Changed

- Replaced the localStorage-based auth/session model with Supabase-backed auth.
- Split the single-page prototype into protected routes and route handlers.
- Updated repository documentation to match the current architecture.
