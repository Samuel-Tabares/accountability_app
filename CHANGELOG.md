# Changelog

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
