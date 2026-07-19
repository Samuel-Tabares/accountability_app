# CLAUDE.md

Claude Code context for the TRABIX Granizados accountability app.

## What this app does

Single-tenant operational dashboard for a granizados (frozen drinks) business. Two roles:

- **admin** — records sales, manages production batches, tracks expenses, creates embajadores, configures pricing.
- **embajador** — read-only view of their own wholesale sales, commissions, and boost status.

Admin does everything. Embajadores cannot write any data; the admin creates and manages them.

## Tech stack

- **Framework**: Next.js (App Router) + TypeScript + React
- **Database & Auth**: Supabase (PostgreSQL 17, RLS, Supabase Auth)
- **Rate limiting**: Upstash Redis
- **Styles**: Custom CSS (`app/globals.css`), Google Fonts (Baloo 2 + Paytone One)
- **Icons**: Lucide React
- **Deployment**: Vercel (frontend) + Supabase Cloud (backend) + Upstash Cloud (Redis)

## Auth system

Users log in with **username/code + password**, not email. Email is a hidden alias (`<username>@<SUPABASE_AUTH_ALIAS_DOMAIN>`) used only by Supabase Auth internally.

After login, two cookies are set:
- Supabase Auth cookie (automatic)
- `trabix-session` — custom HMAC-SHA256 signed HTTP-only cookie. The secret is derived from `SUPABASE_SERVICE_ROLE_KEY`. Do not add a separate secret env var; this is intentional.

New embajadores get a temporary password and are forced to `/cambiar-contrasena` on first login. Password policy: min 6 chars, at least 1 uppercase.

## Roles and access

- Middleware (`middleware.ts`) redirects by role and rate-limits embajador navigation.
- RLS policies enforce access at the database layer — the frontend is not the source of truth for permissions.
- Embajadores can only read their own `sales` and `expenses` rows.

## Domain model

### Sales (`sale_type` enum)
- `unit` — single granizado, priced from active pricing version
- `promo` — promotional package
- `gift` — gift variant with/without alcohol
- `singleNoAlcohol` / `giftNoAlcohol` — alcohol-free variants
- `wholesale` — bulk sale assigned to an embajador, minimum 20 units

### Wholesale pricing
Tiered by quantity and variant (`withAlcohol` / `withoutAlcohol`). Each tier has:
- `unit_price`, `commission_pct` (embajador commission), `client_discount_pct`

Each sale snapshots the active pricing tier at creation time so historical records stay accurate if pricing changes.

### FIFO cost of goods
Production batches are created with `units_produced` and `total_cost`. When a sale is recorded, batches are consumed oldest-first and recorded in `sale_batch_consumptions`. `sales.cost_of_goods` stores the FIFO cost for that sale.

### Ambassador levels & cycles (gamification)
Each ambassador runs a personal **30-day cycle anchored to their join date** (`profiles.created_at`),
resetting to Nivel 0 each cycle. Level is derived from wholesale units sold in the current cycle
(Plata 99+, Oro 199+, Diamante 399+). Config + compute-on-read logic live in `src/lib/levels.ts`.
At cycle close the admin liquidates the level's **base salary** as a `oneTime` expense linked to the
ambassador (reduces utilidad neta), recorded in `ambassador_payouts` (idempotent per cycle). The
level's free granizados are auto-recorded as a `gift` sale (FIFO cost, no revenue). Commission % is
independent of level — it comes from the wholesale quantity tier, not the level.

### Commissions and boost
Wholesale sales auto-generate an `expense` record (type `commission`) linked via `expenses.source_sale_id`. If the embajador has `boost_active = true`, a `boost_bonus_pct` (from the pricing version, default 5%) is added on top. Boost is a 7-day toggle set by admin.

### Consignaciones
Consignment clients hold Trabix stock on credit and pay as they sell. Lifecycle: initial delivery →
replenishment (reposición vs ampliación, tracked by previous base per variant) → pickup (recogida,
returns unsold inventory) → optional reactivation. Each stage consumes FIFO batches and snapshots
pricing like a wholesale sale. Logic lives in `src/lib/consignment-*.ts`; UI in `ConsignacionesPanel`.

### Invoicing (facturación PDF)
Every wholesale sale and every consignment action generates a downloadable branded PDF invoice.
`src/lib/invoice/` holds kind-discriminated types, builders from app state, on-demand consecutive
numbering per type (VM, EC, RC, RG, RA), and a `jspdf`/`jspdf-autotable` A5 generator. Company legal
data is a singleton row (`company_info`).

### Financial ledger
- `Venta base` = price before discounts
- `Descuentos` = money not charged (stored as contra-ingreso, not a paid expense)
- `Ingresos netos` = venta base − descuentos
- `Utilidad bruta` = ingresos netos − costo producción (FIFO)
- `Utilidad neta` = utilidad bruta − comisiones − gastos manuales

## Dashboard state architecture

The admin dashboard avoids `router.refresh()` (which re-runs ~14 SSR queries). Instead, each API
route returns the inserted/updated rows in its JSON response, and panels merge them into local React
state via an `onStateUpdate` callback. Shared mappers from DB shape → app shape live in
`src/lib/state-mappers.ts`. When adding a mutation, return the affected rows from the route and add a
mapper rather than triggering a full refresh. (Exception: the server-side "Stock en consignación"
hero metric only recomputes on full page reload.)

## Key conventions

- API routes return JSON when the `Accept: application/json` header is present or when the request body is JSON; otherwise they redirect (HTML forms).
- Admin-only routes call `requireAdmin()` from `src/lib/route-auth.ts` at the top of the handler.
- Supabase admin client (service role) lives in `src/lib/supabase/admin.ts` — never expose it client-side.
- All monetary values are stored as Colombian pesos (integers or numeric, no decimals in practice).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Also used as session cookie HMAC secret |
| `SUPABASE_AUTH_ALIAS_DOMAIN` | yes | e.g. `trabix.local` or `trabix.app` |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash auth token |

## Database migrations

Run in order with `supabase db reset` locally or apply manually in Supabase SQL editor:

1. `0001_init.sql` — core tables (`profiles`, `sales`, `expenses`), auth trigger, RLS
2. `0002_identity_alias.sql` — username/code aliasing
3. `0003_operational_model.sql` — production batches, pricing versions, wholesale tiers, FIFO
4. `0004_net_sale_boost.sql` — boost toggle, net_profit column, source_sale_id on expenses
5. `0005_consignaciones.sql` / `0006_consignaciones_fix.sql` / `0007_consignaciones_pickup.sql` — consignment clients, deliveries, replenishments, pickups
6. `0008_company_info.sql` — singleton company legal data (for invoices) + seed
7. `0009_consignment_reactivations.sql` — reactivation audit trail (RA invoices)
8. `0010_replenishment_previous_base.sql` — previous base per variant (reposición vs ampliación)
9. `0011_wholesale_client_fields.sql` — `client_name`, `client_address`, `client_phone`, `delivery_fee` on `sales`
10. `0012_ambassador_payouts.sql` — base-salary liquidation per closed 30-day cycle; idempotent on `(ambassador_profile_id, cycle_start)`
11. `0013_perf_indexes.sql` — non-destructive performance indexes on hot query paths (sales by ambassador/type/date, expenses by ambassador, consumptions by sale, returns by client/variant)

## Workflow rules

- Run `npm run typecheck` and `npm run build` before finishing any runtime code change.
- Update `CHANGELOG.md` and bump version in `package.json` for every shipped change.
- Update `README.md` if setup, routes, env vars, or deployment instructions change.
- Keep migration files append-only — never edit an applied migration.
- Do not add client-side auth checks as the primary permission gate; RLS is the gate.
