# TRABIX Granizados

Version `0.6.0`

TRABIX is a Next.js + Supabase app with two protected experiences:

- `admin`
- `embajador`

The app uses Supabase Auth for sessions, Supabase Postgres for data, and RLS for authorization at the database layer. The user-facing login is `usuario/código + contraseña`; email is only a hidden technical alias for Supabase Auth.

## Current Architecture

- `app/login` handles sign in with username/code plus password.
- `app/cambiar-contrasena` forces users with temporary passwords to set a permanent password.
- `app/admin` is a protected server page that loads Supabase data and renders the restored operational dashboard.
- `app/embajador` is the embajador dashboard for assigned wholesale sales and commissions.
- `middleware.ts` redirects users by session and role, and rate-limits embajador navigation.
- `app/api/*` contains authenticated route handlers for login, logout, password changes, embajador creation/reset, sales, expenses, batches, settings, and profile updates. Dashboard calls use JSON responses while form submissions can still follow redirects.
- `supabase/migrations/0001_init.sql` defines the local schema, auth trigger, and RLS policies.
- `supabase/migrations/0002_identity_alias.sql` adds username/code aliasing and hidden-auth profile fields.
- `supabase/migrations/0003_operational_model.sql` adds persisted production batches, pricing versions, wholesale tiers, sale snapshots, FIFO consumption records, embajador levels, and temporary-password flags.

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local` from `.env.example`.

3. Start Supabase locally and apply the migration.

```bash
supabase start
supabase db reset
```

4. Run the app.

```bash
npm run dev
```

5. Bootstrap the local admin user for testing.

```bash
npm run seed:admin
```

## Docker

Run the app in a container on port `3000`.

```bash
docker compose up --build
```

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_ALIAS_DOMAIN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ALLOW_BOOTSTRAP_ADMIN`

## Abuse Protection

- Login requests are rate-limited by IP and by username/IP pair with Upstash Redis.
- Embajador page loads and embajador sales submissions are rate-limited by authenticated user ID plus IP.
- When login is rate-limited, the API returns `429 Too Many Requests` and the login form shows the retry window.
- If Redis is temporarily unavailable, login fails closed and embajador navigation is allowed to preserve availability.

## Release And Traceability

- Change history lives in [CHANGELOG.md](./CHANGELOG.md).
- Repo workflow rules live in [AGENTS.md](./AGENTS.md).
- Version bumps are tracked in `package.json`.
- Any code change should be matched with the documentation it affects.

## Security Model

- Supabase Auth owns the session.
- The app also sets a small signed `trabix-session` HTTP-only cookie after login so server-rendered pages and dashboard APIs can reliably resolve the Supabase profile when the full Supabase Auth cookie is too large for local development.
- `profiles` links app users to `auth.users`.
- Embajadores are created only by the admin through the admin panel or the bootstrap script.
- The admin panel creates embajadores with full name, code, and phone. The backend sets `username = código`, generates a temporary password, starts the profile at `nivel0`, and shows credentials only once.
- Temporary passwords force `/cambiar-contrasena`; the permanent password must have at least 6 characters and one uppercase letter.
- Admins can reset an embajador password from the dashboard. The new temporary password is shown once and forces another password change.
- Admin bootstrap user `samuel / samuel123` can be created with `npm run seed:admin` in local development.
- RLS enforces access at the database layer, so the frontend is not the source of truth for permissions.

## Data Model Notes

- `pricing_versions` and `pricing_wholesale_tiers` store versioned pricing. Saving settings creates a new active version; old sales keep their stored snapshot.
- `production_batches` and `production_batch_items` persist lots and costs used by FIFO.
- `sales` stores sale type, wholesale variant, pricing version, gross price, net amount, discount, commission, cost of goods, gross profit, and margin snapshots.
- `sale_batch_consumptions` records which batches were consumed by each sale.
- Current real base tables from earlier releases remain: `profiles`, `sales`, and `expenses`.

## License

This repository uses a restrictive source-available license. See [LICENSE](./LICENSE) for terms.

## Notes

- `localStorage` is no longer used as the auth/session source of truth.
- Production lots, pricing settings, embajadores, sales, and expenses now persist in Supabase.
- Level progression rules beyond the initial `nivel0` are intentionally left for a later business-rule pass.
- The app is intended to be maintained through documented, versioned changes.
