# AGENTS.md

This repository is maintained with strict traceability.

> **Claude Code users**: see `CLAUDE.md` for domain context, conventions, and environment variable details.

## Change rules

- Every code change must be accompanied by any documentation change it affects.
- Update `README.md` when setup, runtime behavior, routes, env vars, or deployment change.
- Update `CHANGELOG.md` for every meaningful feature, fix, or behavioral change.
- Bump the project version in `package.json` when a change alters shipped behavior.
- If auth, data access, or migrations change, update the relevant Supabase notes and examples in the docs.

## Workflow rules

- Inspect the current repo state before editing.
- Prefer small, reviewable commits with a clear message.
- Run `typecheck` and `build` before finishing when the change touches runtime code.
- Do not leave code changes undocumented.
- If a task changes both code and docs, update both in the same work session.

## Documentation expectations

- Keep setup instructions current.
- Keep route and architecture summaries current.
- Record release-relevant changes in the changelog.
- Keep examples, env files, and deployment instructions synchronized with the code.

## Deployment

- The app is deployed on **Vercel** (frontend) + **Supabase Cloud** (database, auth) + **Upstash Cloud** (Redis).
- `vercel.json` pins the framework and build commands.
- Environment variables must be set in the Vercel project dashboard — never commit `.env.local`.

## Scope note

- This file governs assistant workflow in this repo.
- It is not a substitute for legal advice or a formal release policy.
