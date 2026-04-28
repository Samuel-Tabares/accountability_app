# TRABIX Granizados

Version `0.2.0`

TRABIX is a Next.js + Supabase app with two protected experiences:

- `admin`
- `embajador`

The app uses Supabase Auth for sessions, Supabase Postgres for data, and RLS for authorization at the database layer.

## Current Architecture

- `app/login` handles sign in and sign up.
- `app/admin` is the admin dashboard.
- `app/embajador` is the embajador dashboard.
- `middleware.ts` redirects users by session and role.
- `app/api/*` contains authenticated route handlers for login, logout, sales, expenses, and profile updates.
- `supabase/migrations/0001_init.sql` defines the local schema, auth trigger, and RLS policies.

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

## Docker

Run the app in a container on port `3000`.

```bash
docker compose up --build
```

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Release And Traceability

- Change history lives in [CHANGELOG.md](./CHANGELOG.md).
- Repo workflow rules live in [AGENTS.md](./AGENTS.md).
- Version bumps are tracked in `package.json`.
- Any code change should be matched with the documentation it affects.

## Security Model

- Supabase Auth owns the session.
- `profiles` links app users to `auth.users`.
- The first authenticated user becomes `admin`.
- Later users default to `embajador`.
- RLS enforces access at the database layer, so the frontend is not the source of truth for permissions.

## License

This repository uses a restrictive source-available license. See [LICENSE](./LICENSE) for terms.

## Notes

- `localStorage` is no longer used as the auth/session source of truth.
- The app is intended to be maintained through documented, versioned changes.
