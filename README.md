# TRABIX Granizados

Version `0.4.0`

TRABIX is a Next.js + Supabase app with two protected experiences:

- `admin`
- `embajador`

The app uses Supabase Auth for sessions, Supabase Postgres for data, and RLS for authorization at the database layer. The user-facing login is `usuario/código + contraseña`; email is only a hidden technical alias for Supabase Auth.

## Current Architecture

- `app/login` handles sign in with username/code plus password.
- `app/admin` is the admin dashboard.
- `app/embajador` is the embajador dashboard.
- `middleware.ts` redirects users by session and role, and rate-limits embajador navigation.
- `app/api/*` contains authenticated route handlers for login, logout, embajador creation, sales, expenses, and profile updates.
- `supabase/migrations/0001_init.sql` defines the local schema, auth trigger, and RLS policies.
- `supabase/migrations/0002_identity_alias.sql` adds username/code aliasing and hidden-auth profile fields.

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
- `profiles` links app users to `auth.users`.
- Embajadores are created only by the admin through the admin panel or the bootstrap script.
- Admin bootstrap user `samuel / samuel123` can be created with `npm run seed:admin` in local development.
- RLS enforces access at the database layer, so the frontend is not the source of truth for permissions.

## License

This repository uses a restrictive source-available license. See [LICENSE](./LICENSE) for terms.

## Notes

- `localStorage` is no longer used as the auth/session source of truth.
- The app is intended to be maintained through documented, versioned changes.
