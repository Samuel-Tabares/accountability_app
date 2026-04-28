# Changelog

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
