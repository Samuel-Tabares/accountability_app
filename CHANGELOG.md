# Changelog

## [0.3.0] - 2026-04-28

### Added

- Upstash Redis-backed rate limiting for login and embajador surfaces.
- Per-IP and per-email/IP throttles on the login flow.
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
