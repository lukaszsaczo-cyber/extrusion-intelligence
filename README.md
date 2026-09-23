# Extrusion Intelligence

Decision support for twin-screw extrusion. Read-only advisory: the application never sends commands to a machine (no PLC write).

## Status (foundation)
- Next.js App Router, TypeScript strict, Tailwind v4, PL/EN i18n (cookie `ei_locale`, build fails on key mismatch).
- Supabase Auth (email + password), protected routes via middleware, organization + role from session and RLS.
- Dashboard reads real data (machines, runs). Other sections are placeholders with no sample data.
- Private engine: `server/engine-contract` (verified public contract + sanitizer). Without
  `EXTRUSION_CORE_API_URL` / `EXTRUSION_CORE_API_TOKEN` the app shows "engine not connected" and no predictions.
- Build runs `scripts/check-i18n.mjs` before and `scripts/check-bundle.mjs` after `next build`
  (fails if a server secret value appears in `.next/static`).

## Env
See `.env.example`. `NEXT_PUBLIC_*` are the public Supabase contract. Everything else is server-only.

## Database
Schema and RLS live in the Supabase project (5 migrations, verified 35/35). Migration files go to
`supabase/migrations/` with the exact timestamps listed in the handoff.
