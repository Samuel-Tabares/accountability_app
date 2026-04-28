# TRABIX Granizados

Next.js + Supabase app with role-based dashboards for `admin` and `embajador`.

## Stack

- Next.js App Router
- Supabase Auth
- Supabase Postgres with RLS
- TypeScript

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Fill `.env.local` from `.env.example`.

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

Run the web app in a container on port `3000`.

```bash
docker compose up --build
```

## Auth model

- `profiles` is the app identity table linked to `auth.users`.
- The first authenticated user created by Supabase becomes `admin`.
- Later users default to `embajador`.
- Middleware redirects unauthenticated traffic to `/login` and keeps users on the dashboard that matches their role.

## Data access

- Admins can read and write all protected tables.
- Embajadores can only read their own scoped rows.
- All authorization-sensitive queries go through Supabase and are enforced again with RLS.

## Routes

- `/login`
- `/admin`
- `/embajador`

## Notes

- This repo no longer treats `localStorage` as the source of truth for authentication or permissions.
- The old prototype logic is kept only as reference in the library folder.
